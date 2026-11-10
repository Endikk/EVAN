using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Application.Usines;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;

namespace EVAN.Application.Tests;

/// <summary>Stockage de test : garde ce qui est écrit, peut tomber en panne, échouer quelques fois ou retenir la première alarme.</summary>
internal sealed class TestStore : IStore
{
    private readonly object _gate = new();
    private readonly TaskCompletionSource _liberation = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly List<MeasurementRow> _rows = new();
    private readonly List<Alarme> _alarms = new();
    private readonly List<Evenement> _events = new();
    private readonly List<(string MachineId, string Etat)> _states = new();
    private int _appelsAlarme;

    /// <summary>Base hors service : toute écriture lève.</summary>
    public volatile bool Panne;
    /// <summary>Écritures d'alarme à faire échouer avant de réussir.</summary>
    public int EchecsAlarme;
    /// <summary>La première écriture d'alarme attend <see cref="Liberer"/> : base lente.</summary>
    public bool RetenirPremiereAlarme;
    /// <summary>Réponses de la base au redémarrage.</summary>
    public List<(string SiteId, Alarme Alarme)> EnBase { get; } = new();
    public List<(string SiteId, Evenement Evenement)> JournalEnBase { get; } = new();

    public void Liberer() => _liberation.TrySetResult();

    public MeasurementRow[] Rows { get { lock (_gate) return _rows.ToArray(); } }
    public Alarme[] AlarmWrites { get { lock (_gate) return _alarms.ToArray(); } }
    public Evenement[] EventWrites { get { lock (_gate) return _events.ToArray(); } }
    public (string MachineId, string Etat)[] StateWrites { get { lock (_gate) return _states.ToArray(); } }

    public string Kind => "test";
    public bool Healthy => !Panne;

    public Task InitializeAsync(ReferenceData data, CancellationToken ct) => Task.CompletedTask;

    public void Enqueue(IEnumerable<MeasurementRow> rows)
    {
        lock (_gate) _rows.AddRange(rows);
    }

    public async Task SaveAlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default)
    {
        if (Interlocked.Increment(ref _appelsAlarme) == 1 && RetenirPremiereAlarme) await _liberation.Task;
        lock (_gate)
        {
            if (Panne) throw new TimeoutException("base injoignable");
            if (EchecsAlarme > 0)
            {
                EchecsAlarme--;
                throw new TimeoutException("base injoignable");
            }
            _alarms.Add(alarm);
        }
    }

    public Task SaveEventAsync(string siteId, Evenement e, CancellationToken ct = default)
    {
        lock (_gate)
        {
            if (Panne) throw new TimeoutException("base injoignable");
            _events.Add(e);
        }
        return Task.CompletedTask;
    }

    public Task SaveMachineStateAsync(string machineId, string etat, double vitesse, DateTimeOffset t, CancellationToken ct = default)
    {
        lock (_gate)
        {
            if (Panne) throw new TimeoutException("base injoignable");
            _states.Add((machineId, etat));
        }
        return Task.CompletedTask;
    }

    public Task<IReadOnlyList<Alarme>> AlarmsAsync(string siteId, DateTimeOffset from, DateTimeOffset to, string? machineId, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Alarme>>(Array.Empty<Alarme>());

    public Task<IReadOnlyList<Alarme>> UnresolvedAlarmsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Alarme>>(EnBase
            .Where(x => x.SiteId == siteId && x.Alarme.Statut != "resolue" && x.Alarme.Horodatage >= from.ToUnixTimeMilliseconds())
            .Select(x => x.Alarme)
            .OrderByDescending(a => a.Horodatage)
            .ToList());

    public bool IsPermanentFailure(Exception ex) => ex is InvalidDataException;

    public Task<IReadOnlyList<SeriesPoint>> SeriesAsync(string pointId, DateTimeOffset from, DateTimeOffset to, TimeSpan bucket, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<SeriesPoint>>(Array.Empty<SeriesPoint>());

    public Task<IReadOnlyList<Evenement>> EventsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<Evenement>>(JournalEnBase.Where(x => x.SiteId == siteId).Select(x => x.Evenement).OrderByDescending(e => e.Horodatage).ToList());

    /// <summary>Usines enregistrées « en base », relues par la reprise au redémarrage.</summary>
    public List<UsineEnregistree> UsinesEnBase { get; } = new();

    public Task<IReadOnlyList<UsineEnregistree>> UsinesAsync(CancellationToken ct = default) => Task.FromResult<IReadOnlyList<UsineEnregistree>>(UsinesEnBase.ToList());

    public Task EnregistrerUsineAsync(UsineEnregistree usine, CancellationToken ct = default)
    {
        lock (_gate)
        {
            UsinesEnBase.RemoveAll(u => u.SiteId == usine.SiteId);
            UsinesEnBase.Add(usine);
        }
        return Task.CompletedTask;
    }
}

/// <summary>Diffusion de test : garde les alarmes et les événements envoyés, peut tomber en panne.</summary>
internal sealed class TestNotifier : IRealtimeNotifier
{
    private readonly List<Alarme> _alarms = new();
    private readonly List<Evenement> _events = new();
    public volatile bool Panne;

    public Alarme[] Alarms { get { lock (_alarms) return _alarms.ToArray(); } }
    public Evenement[] Events { get { lock (_events) return _events.ToArray(); } }

    public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) =>
        Panne ? Task.FromException(new IOException("écran injoignable")) : Task.CompletedTask;

    public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default)
    {
        if (Panne) return Task.FromException(new IOException("écran injoignable"));
        lock (_alarms) _alarms.Add(alarm);
        return Task.CompletedTask;
    }

    public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default)
    {
        if (Panne) return Task.FromException(new IOException("écran injoignable"));
        lock (_events) _events.Add(e);
        return Task.CompletedTask;
    }

    public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default) => Task.CompletedTask;
}

/// <summary>Bus de test : garde les publications, peut lever comme un broker coupé en plein envoi.</summary>
internal sealed class TestBus : IMessageBus
{
    private readonly List<string> _topics = new();
    public volatile bool Panne;

    public string[] Topics { get { lock (_topics) return _topics.ToArray(); } }
    public bool IsConnected => true;

    public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default)
    {
        if (Panne) throw new IOException("broker coupé");
        lock (_topics) _topics.Add(topic);
        return Task.FromResult(true);
    }

    public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class =>
        Task.FromResult<TReply?>(null);
}

internal static class Attente
{
    /// <summary>Attend qu'une condition devienne vraie (écritures en file, diffusion asynchrone), au plus <paramref name="ms"/>.</summary>
    public static async Task<bool> Jusqua(Func<bool> condition, int ms = 3000)
    {
        var fin = DateTime.UtcNow.AddMilliseconds(ms);
        while (!condition())
        {
            if (DateTime.UtcNow > fin) return false;
            await Task.Delay(10);
        }
        return true;
    }
}
