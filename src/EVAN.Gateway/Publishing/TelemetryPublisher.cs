using System.Collections.Concurrent;
using System.Threading.Channels;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using EVAN.Gateway.Sources;
using EVAN.Messaging;

namespace EVAN.Gateway.Publishing;

/// <summary>
/// Regroupe les échantillons par machine et les publie en MQTT (evan.telemetry/1) à intervalle fixe ; l'état d'une
/// machine part à chaque changement et au battement (StateHeartbeatMs), plus du tout après une perte de liaison.
/// Si le broker est injoignable, les messages attendent dans une file bornée (les plus anciens sont abandonnés)
/// et partent dans l'ordre au retour de la connexion : rien n'est perdu sur une coupure courte. La file est mesurée
/// (<see cref="MesuresEnvoi"/>).
/// </summary>
public sealed class TelemetryPublisher : BackgroundService, ISampleSink
{
    private readonly GatewayOptions _options;
    private readonly ILogger<TelemetryPublisher> _log;
    private readonly TimeSpan _heartbeat;
    private readonly ConcurrentDictionary<string, ConcurrentQueue<Metric>> _pending = new();
    private readonly ConcurrentDictionary<string, (string Etat, double? Vitesse)> _states = new();
    /// <summary>Dernier état publié par machine et son heure (lu et écrit par le seul envoi groupé).</summary>
    private readonly Dictionary<string, ((string Etat, double? Vitesse) Etat, DateTimeOffset Le)> _published = new();
    private readonly Channel<OutboxItem> _outbox;
    private readonly OutboxSender _sender;
    private long _seq;
    private long _dropped;
    private long _droppedLogged;

    public TelemetryPublisher(MqttConnection mqtt, GatewayOptions options, ILogger<TelemetryPublisher> log)
        : this(options, log, (topic, payload, ct) => mqtt.PublishAsync(topic, payload, ct: ct), () => mqtt.IsConnected)
    {
    }

    internal TelemetryPublisher(GatewayOptions options, ILogger<TelemetryPublisher> log, Func<string, object, CancellationToken, Task<bool>> publish, Func<bool> isConnected)
    {
        _options = options;
        _log = log;
        _heartbeat = TimeSpan.FromMilliseconds(options.StateHeartbeatMs);
        _outbox = Channel.CreateBounded<OutboxItem>(new BoundedChannelOptions(options.BufferCapacity)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
        }, _ =>
        {
            Interlocked.Increment(ref _dropped);
            MesuresEnvoi.Perdu("file_pleine");
        });
        _sender = new OutboxSender(_outbox.Reader, publish, isConnected, log);
    }

    /// <summary>File d'envoi (tests).</summary>
    internal ChannelReader<OutboxItem> Outbox => _outbox.Reader;

    public void Push(string machineId, Metric metric)
    {
        // NaN ou infini : non sérialisable en JSON, le lot entier serait refusé à chaque essai.
        if (!double.IsFinite(metric.Value)) return;
        _pending.GetOrAdd(machineId, _ => new ConcurrentQueue<Metric>()).Enqueue(metric);
    }

    public void State(string machineId, string etat, double? vitesse = null) => _states[machineId] = (etat, vitesse);

    public void Lost(string machineId) => _states.TryRemove(machineId, out _);

    public void Alarm(PlcAlarmMessage alarm)
    {
        var msg = new PlcAlarmMessage
        {
            SiteId = _options.SiteId, MachineId = alarm.MachineId, Ts = alarm.Ts, Code = alarm.Code, Organe = alarm.Organe, Active = alarm.Active, Message = alarm.Message,
        };
        Envoyer(new OutboxItem(Topics.PlcAlarm(_options.SiteId, alarm.MachineId), msg));
    }

    /// <summary>Message mis en file d'envoi, compté avant d'y entrer : l'envoi peut l'accuser avant le retour de TryWrite.</summary>
    private void Envoyer(OutboxItem item)
    {
        MesuresEnvoi.File(1);
        if (!_outbox.Writer.TryWrite(item)) MesuresEnvoi.File(-1);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var sender = Supervision.RunAsync("envoi MQTT", _sender.RunAsync, _log, stoppingToken);
        try
        {
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(_options.PublishIntervalMs));
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    Tick(DateTimeOffset.UtcNow);
                }
                catch (Exception ex)
                {
                    _log.LogError(ex, "Envoi groupé en échec");
                }
                ReportDropped();
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // arrêt
        }
        finally
        {
            await sender;
        }
    }

    /// <summary>Un envoi groupé : mesures en attente de chaque machine, puis état des machines changé ou dont le battement est dû.</summary>
    internal void Tick(DateTimeOffset now)
    {
        foreach (var (machineId, queue) in _pending)
        {
            var metrics = new List<Metric>();
            while (queue.TryDequeue(out var m)) metrics.Add(m);
            if (metrics.Count == 0) continue;
            var oldest = metrics.Min(m => m.Ts ?? now);
            Envoyer(new OutboxItem(Topics.Telemetry(_options.SiteId, machineId), new TelemetryMessage
            {
                SiteId = _options.SiteId,
                MachineId = machineId,
                GatewayId = _options.GatewayId,
                Seq = Interlocked.Increment(ref _seq),
                Ts = oldest,
                Metrics = metrics,
                Trace = new() { ["plc"] = oldest, ["gateway"] = now },
            }));
        }
        // Liaison perdue : la machine n'est plus annoncée ; à son retour, son état repart aussitôt.
        foreach (var machineId in _published.Keys.Where(id => !_states.ContainsKey(id)).ToList()) _published.Remove(machineId);
        foreach (var (machineId, st) in _states)
        {
            if (_published.TryGetValue(machineId, out var last) && last.Etat == st && now - last.Le < _heartbeat) continue;
            _published[machineId] = (st, now);
            Envoyer(new OutboxItem(Topics.State(_options.SiteId, machineId), new StateMessage
            {
                SiteId = _options.SiteId, MachineId = machineId, Ts = now, Etat = st.Etat, Vitesse = st.Vitesse ?? 0, Facteur = st.Etat == "marche" ? 1 : 0,
            }));
        }
    }

    private void ReportDropped()
    {
        var dropped = Interlocked.Read(ref _dropped);
        if (dropped == _droppedLogged) return;
        _log.LogWarning("File pleine pendant la coupure : {Count} messages anciens abandonnés", dropped - _droppedLogged);
        _droppedLogged = dropped;
    }
}
