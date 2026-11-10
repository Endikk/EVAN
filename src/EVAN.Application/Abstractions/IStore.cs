using EVAN.Application.Usines;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;

namespace EVAN.Application.Abstractions;

public readonly record struct MeasurementRow(DateTimeOffset Time, string PointId, double Value, short Quality);

public sealed record SeriesPoint(long T, double Avg, double Min, double Max);

/// <summary>
/// Persistance : séries temporelles (TimescaleDB), alarmes, événements, états machine, usines enregistrées.
/// Sans base configurée, une implémentation mémoire garde quelques heures pour la démo.
/// </summary>
public interface IStore
{
    string Kind { get; }
    bool Healthy { get; }
    Task InitializeAsync(ReferenceData data, CancellationToken ct);
    void Enqueue(IEnumerable<MeasurementRow> rows);
    Task SaveAlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default);
    Task SaveEventAsync(string siteId, Evenement e, CancellationToken ct = default);
    Task SaveMachineStateAsync(string machineId, string etat, double vitesse, DateTimeOffset t, CancellationToken ct = default);
    Task<IReadOnlyList<Alarme>> AlarmsAsync(string siteId, DateTimeOffset from, DateTimeOffset to, string? machineId, CancellationToken ct = default);
    /// <summary>Alarmes non résolues d'un site depuis <paramref name="from"/>, les plus récentes d'abord (reprise au redémarrage).</summary>
    Task<IReadOnlyList<Alarme>> UnresolvedAlarmsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default);
    Task<IReadOnlyList<SeriesPoint>> SeriesAsync(string pointId, DateTimeOffset from, DateTimeOffset to, TimeSpan bucket, CancellationToken ct = default);
    Task<IReadOnlyList<Evenement>> EventsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default);
    /// <summary>Usines enregistrées par les organisations réelles, relues au démarrage (jamais celles de la démo).</summary>
    Task<IReadOnlyList<UsineEnregistree>> UsinesAsync(CancellationToken ct = default);
    /// <summary>
    /// Remplace d'un seul bloc la configuration complète d'une usine (site, bâtiments, zones, machines, organes, points,
    /// connexions). Lève <see cref="IdentifiantPrisException"/> si l'usine ou l'un de ses identifiants appartient à une
    /// autre usine : rien n'est alors écrit.
    /// </summary>
    Task EnregistrerUsineAsync(UsineEnregistree usine, CancellationToken ct = default);
    /// <summary>
    /// Vrai si l'écriture a été refusée par le serveur et le serait encore à l'identique (contrainte, donnée invalide) ;
    /// faux pour une base injoignable ou surchargée, qu'il suffit d'attendre.
    /// </summary>
    bool IsPermanentFailure(Exception ex);
}
