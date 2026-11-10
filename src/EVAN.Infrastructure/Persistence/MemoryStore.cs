using System.Collections.Concurrent;
using EVAN.Application.Abstractions;
using EVAN.Application.Comptes;
using EVAN.Application.Usines;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Sites;

namespace EVAN.Infrastructure.Persistence;

/// <summary>
/// Stockage en mémoire (développement sans base) : 6 h de mesures agrégées à 10 s par point, alarmes et journal bornés.
/// Comptes, organisations et usines enregistrées y vivent jusqu'à l'arrêt de l'API.
/// </summary>
public sealed class MemoryStore : IStore, IComptesStore
{
    private const int BucketMs = 10_000;
    private const int MaxBuckets = 6 * 360;
    /// <summary>Alarmes gardées ; au-delà, les plus anciennes résolues partent d'abord (un dixième d'un coup).</summary>
    internal const int MaxAlarms = 5000;
    private readonly ConcurrentDictionary<string, LinkedList<(long T, double Sum, double Min, double Max, int N)>> _series = new();
    private readonly ConcurrentDictionary<string, (string Site, Alarme A)> _alarms = new();
    private readonly object _trimGate = new();
    private readonly ConcurrentQueue<(string Site, Evenement E)> _events = new();
    private readonly object _referentiel = new();
    private readonly Dictionary<string, UsineEnregistree> _usines = new();
    private readonly Dictionary<string, Organisation> _organisations = new();
    private readonly Dictionary<string, Compte> _comptes = new();

    public string Kind => "memoire";
    public bool Healthy => true;

    public Task InitializeAsync(ReferenceData data, CancellationToken ct) => Task.CompletedTask;

    public void Enqueue(IEnumerable<MeasurementRow> rows)
    {
        foreach (var r in rows)
        {
            var list = _series.GetOrAdd(r.PointId, _ => new LinkedList<(long, double, double, double, int)>());
            var b = r.Time.ToUnixTimeMilliseconds() / BucketMs * BucketMs;
            lock (list)
            {
                var last = list.Last;
                if (last is not null && last.Value.T == b)
                {
                    var v = last.Value;
                    last.Value = (b, v.Sum + r.Value, Math.Min(v.Min, r.Value), Math.Max(v.Max, r.Value), v.N + 1);
                }
                else
                {
                    list.AddLast((b, r.Value, r.Value, r.Value, 1));
                    while (list.Count > MaxBuckets) list.RemoveFirst();
                }
            }
        }
    }

    public Task SaveAlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default)
    {
        _alarms[alarm.Id] = (siteId, alarm);
        if (_alarms.Count > MaxAlarms) Trim();
        return Task.CompletedTask;
    }

    private void Trim()
    {
        lock (_trimGate)
        {
            var surplus = _alarms.Count - MaxAlarms;
            if (surplus <= 0) return;
            var parties = _alarms.Values
                .OrderBy(x => x.A.Statut != "resolue")
                .ThenBy(x => x.A.Horodatage)
                .Take(surplus + MaxAlarms / 10)
                .Select(x => x.A.Id)
                .ToList();
            foreach (var id in parties) _alarms.TryRemove(id, out _);
        }
    }

    public Task SaveEventAsync(string siteId, Evenement e, CancellationToken ct = default)
    {
        _events.Enqueue((siteId, e));
        while (_events.Count > 2000 && _events.TryDequeue(out _)) { }
        return Task.CompletedTask;
    }

    public Task SaveMachineStateAsync(string machineId, string etat, double vitesse, DateTimeOffset t, CancellationToken ct = default) => Task.CompletedTask;

    public Task<IReadOnlyList<Alarme>> AlarmsAsync(string siteId, DateTimeOffset from, DateTimeOffset to, string? machineId, CancellationToken ct = default)
    {
        long f = from.ToUnixTimeMilliseconds(), u = to.ToUnixTimeMilliseconds();
        IReadOnlyList<Alarme> res = _alarms.Values
            .Where(x => x.Site == siteId && x.A.Horodatage >= f && x.A.Horodatage <= u && (machineId is null || x.A.MachineId == machineId))
            .Select(x => x.A)
            .OrderByDescending(a => a.Horodatage)
            .ToList();
        return Task.FromResult(res);
    }

    public Task<IReadOnlyList<Alarme>> UnresolvedAlarmsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default)
    {
        var f = from.ToUnixTimeMilliseconds();
        IReadOnlyList<Alarme> res = _alarms.Values
            .Where(x => x.Site == siteId && x.A.Statut != "resolue" && x.A.Horodatage >= f)
            .Select(x => x.A)
            .OrderByDescending(a => a.Horodatage)
            .ToList();
        return Task.FromResult(res);
    }

    public bool IsPermanentFailure(Exception ex) => false;

    public Task<IReadOnlyList<SeriesPoint>> SeriesAsync(string pointId, DateTimeOffset from, DateTimeOffset to, TimeSpan bucket, CancellationToken ct = default)
    {
        if (!_series.TryGetValue(pointId, out var list)) return Task.FromResult<IReadOnlyList<SeriesPoint>>(Array.Empty<SeriesPoint>());
        long f = from.ToUnixTimeMilliseconds(), u = to.ToUnixTimeMilliseconds();
        var size = Math.Max(BucketMs, (long)bucket.TotalMilliseconds);
        List<(long T, double Sum, double Min, double Max, int N)> snap;
        lock (list) snap = list.Where(x => x.T >= f && x.T <= u).ToList();
        IReadOnlyList<SeriesPoint> res = snap
            .GroupBy(x => x.T / size * size)
            .Select(g => new SeriesPoint(g.Key, g.Sum(x => x.Sum) / g.Sum(x => x.N), g.Min(x => x.Min), g.Max(x => x.Max)))
            .ToList();
        return Task.FromResult(res);
    }

    public Task<IReadOnlyList<Evenement>> EventsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default)
    {
        var f = from.ToUnixTimeMilliseconds();
        IReadOnlyList<Evenement> res = _events.Where(x => x.Site == siteId && x.E.Horodatage >= f).Select(x => x.E).OrderByDescending(e => e.Horodatage).ToList();
        return Task.FromResult(res);
    }

    public Task<IReadOnlyList<UsineEnregistree>> UsinesAsync(CancellationToken ct = default)
    {
        lock (_referentiel) return Task.FromResult<IReadOnlyList<UsineEnregistree>>(_usines.Values.ToList());
    }

    public Task EnregistrerUsineAsync(UsineEnregistree usine, CancellationToken ct = default)
    {
        lock (_referentiel)
        {
            if (_usines.TryGetValue(usine.SiteId, out var connue) && connue.OrganisationId != usine.OrganisationId)
                throw new IdentifiantPrisException("site.id", "Usine déjà enregistrée par une autre organisation.");
            _usines[usine.SiteId] = usine;
        }
        return Task.CompletedTask;
    }

    public Task<Compte?> CompteAsync(string identifiant, CancellationToken ct = default)
    {
        lock (_referentiel) return Task.FromResult(_comptes.GetValueOrDefault(identifiant));
    }

    public Task<IReadOnlyList<Compte>> ComptesAsync(string organisationId, CancellationToken ct = default)
    {
        lock (_referentiel)
            return Task.FromResult<IReadOnlyList<Compte>>(_comptes.Values.Where(c => c.OrganisationId == organisationId).OrderBy(c => c.CreeLe).ToList());
    }

    public Task<Organisation?> OrganisationAsync(string id, CancellationToken ct = default)
    {
        lock (_referentiel) return Task.FromResult(_organisations.GetValueOrDefault(id));
    }

    public Task<bool> CreerOrganisationAsync(Organisation organisation, Compte admin, CancellationToken ct = default)
    {
        lock (_referentiel)
        {
            if (_comptes.ContainsKey(admin.Identifiant) || _organisations.ContainsKey(organisation.Id)) return Task.FromResult(false);
            _organisations[organisation.Id] = organisation;
            _comptes[admin.Identifiant] = admin;
            return Task.FromResult(true);
        }
    }

    public Task<bool> InstallerAsync(Organisation organisation, Compte admin, CancellationToken ct = default)
    {
        lock (_referentiel)
        {
            if (_comptes.Count > 0) return Task.FromResult(false);
            return CreerOrganisationAsync(organisation, admin, ct);
        }
    }

    public Task<bool> ChangerEmpreinteAsync(string compteId, string empreinte, CancellationToken ct = default)
    {
        lock (_referentiel)
        {
            if (_comptes.Values.FirstOrDefault(c => c.Id == compteId) is not { } compte) return Task.FromResult(false);
            _comptes[compte.Identifiant] = compte with { Empreinte = empreinte };
            return Task.FromResult(true);
        }
    }

    public Task<bool> AjouterCompteAsync(Compte compte, CancellationToken ct = default)
    {
        lock (_referentiel)
        {
            var ajoute = _organisations.ContainsKey(compte.OrganisationId) && _comptes.TryAdd(compte.Identifiant, compte);
            return Task.FromResult(ajoute);
        }
    }
}
