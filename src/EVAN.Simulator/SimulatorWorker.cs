using System.Text.Json;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Sites;
using EVAN.Messaging;
using EVAN.Simulator.Configuration;

namespace EVAN.Simulator;

/// <summary>
/// Simulateur intégré : publie la télémétrie des machines de chaque usine d'exemple sur MQTT (comme leurs passerelles),
/// obéit aux commandes de démonstration (panne, résolution, remise à zéro) et répond aux tests de liaison,
/// usine par usine, sur les sujets de chaque site.
/// </summary>
public sealed class SimulatorWorker(MqttConnection mqtt, ReferenceData data, SimulatorOptions options, ILogger<SimulatorWorker> log) : BackgroundService
{
    /// <summary>Messages publiés en parallèle : on n'attend pas l'accusé QoS 1 de chacun avant le suivant.</summary>
    private const int Paquet = 32;

    /// <summary>Machines simulées par site.</summary>
    private readonly Dictionary<string, Dictionary<string, MachineSimulator>> _sites = new();
    private readonly object _gate = new();
    private long _seq;

    private IEnumerable<DemoUsine> Usines => data.Demo.Usines.Where(u => options.Sites.Count == 0 || options.Sites.Contains(u.Site.Id));

    private string Gateway(DemoUsine usine) => usine.Site.Passerelle ?? options.DefaultGateway;

    /// <summary>(Re)crée les machines simulées d'un site, ou de tous. Graine = rang de la machine dans l'organisation.</summary>
    private void Build(string? siteId = null)
    {
        lock (_gate)
        {
            var index = 0;
            foreach (var usine in data.Demo.Usines)
            {
                var machines = usine.Machines.Select(m => (Machine: m, Index: index++)).ToList();
                if (!Usines.Contains(usine) || (siteId is not null && usine.Site.Id != siteId)) continue;
                _sites[usine.Site.Id] = machines
                    .Where(x => !options.Exclude.Contains(x.Machine.Id))
                    .ToDictionary(x => x.Machine.Id, x => new MachineSimulator(data.Model(x.Machine), x.Index));
            }
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Build();
        foreach (var usine in Usines)
        {
            mqtt.Subscribe(Topics.SimulatorCommand(usine.Site.Id, "#"));
            mqtt.Subscribe(Topics.GatewayCommand(usine.Site.Id, Gateway(usine), "test"));
        }
        mqtt.MessageReceived += (topic, payload) => OnCommandAsync(topic, payload, stoppingToken);
        await mqtt.StartAsync(stoppingToken);
        log.LogInformation("Simulateur : {Count} machines dans {Sites} usines, {Period} ms", _sites.Values.Sum(s => s.Count), _sites.Count, options.PeriodMs);

        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(options.PeriodMs));
        var dt = options.PeriodMs / 1000.0;
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            if (!mqtt.IsConnected) continue;
            try
            {
                await PublishAsync(Step(DateTimeOffset.UtcNow, dt), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Coupure du broker en plein tick : on reprend au tick suivant sans arrêter l'hôte.
                log.LogWarning(ex, "Tick du simulateur en échec");
            }
        }
    }

    private List<(TelemetryMessage T, StateMessage S)> Step(DateTimeOffset now, double dt)
    {
        lock (_gate)
        {
            return _sites.SelectMany(site => site.Value.Values.Select(m =>
            {
                var (metrics, state) = m.Step(site.Key, now, dt);
                var t = new TelemetryMessage
                {
                    SiteId = site.Key,
                    MachineId = m.Machine.Id,
                    GatewayId = "simulateur",
                    Seq = Interlocked.Increment(ref _seq),
                    Ts = now,
                    Metrics = metrics,
                    // Le simulateur tient lieu d'automate et de passerelle : mêmes horodatages réels.
                    Trace = new() { ["plc"] = now, ["gateway"] = DateTimeOffset.UtcNow },
                };
                return (t, state);
            })).ToList();
        }
    }

    /// <summary>
    /// Un tick publié par paquets en parallèle. Chaque machine n'y figure qu'une fois et un tick attend le précédent :
    /// l'ordre par machine est gardé. Un message non parti est perdu (le tick suivant le remplace).
    /// </summary>
    private async Task PublishAsync(List<(TelemetryMessage T, StateMessage S)> batch, CancellationToken ct)
    {
        var perdus = 0;
        foreach (var paquet in batch.Chunk(Paquet / 2))
        {
            var envois = paquet.SelectMany(x => new[]
            {
                mqtt.PublishAsync(Topics.Telemetry(x.T.SiteId, x.T.MachineId), x.T, ct: ct),
                mqtt.PublishAsync(Topics.State(x.S.SiteId, x.S.MachineId), x.S, ct: ct),
            });
            perdus += (await Task.WhenAll(envois)).Count(ok => !ok);
        }
        if (perdus > 0) log.LogWarning("Simulateur : {Count} messages non publiés sur ce tick", perdus);
    }

    private async Task OnCommandAsync(string topic, ReadOnlyMemory<byte> payload, CancellationToken ct)
    {
        // evan/v1/{site}/sim/cmd/… ou evan/v1/{site}/gateway/{passerelle}/cmd/test
        var parts = topic.Split('/');
        if (parts.Length < 4 || data.Demo.Usine(parts[2]) is not { } usine) return;
        var siteId = usine.Site.Id;
        var now = DateTimeOffset.UtcNow;
        if (topic.EndsWith("/sim/cmd/fault") && JsonSerializer.Deserialize<FaultCommand>(payload.Span, Json.Options) is { } f)
        {
            lock (_gate)
            {
                if (Machine(siteId, f.MachineId) is { } m && m.Inject(f.OrganeNumero, now))
                    log.LogInformation("Panne injectée : {Site} {Machine} organe {Organe}", siteId, f.MachineId, f.OrganeNumero);
            }
        }
        else if (topic.EndsWith("/sim/cmd/resolve") && JsonSerializer.Deserialize<ResolveCommand>(payload.Span, Json.Options) is { } r)
        {
            lock (_gate) Machine(siteId, r.MachineId)?.Resolve(now);
        }
        else if (topic.EndsWith("/sim/cmd/reset"))
        {
            Build(siteId);
        }
        else if (topic.EndsWith("/cmd/test") && JsonSerializer.Deserialize<ConnectionTestRequest>(payload.Span, Json.Options) is { } req)
        {
            await mqtt.PublishAsync(Topics.GatewayReply(siteId, Gateway(usine), req.RequestId), DemoTest(usine, req), ct: ct);
        }
    }

    private MachineSimulator? Machine(string siteId, string machineId) =>
        _sites.TryGetValue(siteId, out var machines) && machines.TryGetValue(machineId, out var m) ? m : null;

    /// <summary>Réponse de la passerelle de démonstration de l'usine : liaison simulée, variables issues du catalogue.</summary>
    private ConnectionTestReply DemoTest(DemoUsine usine, ConnectionTestRequest req)
    {
        var machine = usine.Machines.FirstOrDefault(m => m.Id == req.MachineId);
        var reply = new ConnectionTestReply { RequestId = req.RequestId, Ok = machine is not null };
        reply.Steps.Add(new TestStep($"Passerelle « {Gateway(usine)} » (démonstration) : demande reçue", true, 3));
        if (machine is null)
        {
            reply.Steps.Add(new TestStep("Machine inconnue de la passerelle de cette usine", false));
            return reply;
        }
        var model = data.Model(machine);
        reply.Steps.Add(new TestStep($"Protocole {req.Protocole} : liaison simulée établie, lecture seule", true, 42));
        foreach (var p in model.Points) reply.Variables.Add(new BrowsedVariable($"ns=2;s={machine.Numero}.{p.Cle}", p.Libelle, p.Type == "alarme" ? "Boolean" : "Double"));
        reply.Steps.Add(new TestStep($"{reply.Variables.Count} variables disponibles", true));
        return reply;
    }
}
