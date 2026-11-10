namespace EVAN.Core.Domain.Alarms;

/// <summary>Alarme : levée par le moteur de règles ou remontée par l'automate. Horodatages en ms epoch (comme le front).</summary>
public sealed record Alarme
{
    public required string Id { get; init; }
    public required string Code { get; init; }
    public required string Message { get; init; }
    /// <summary>info | attention | critique</summary>
    public required string Gravite { get; init; }
    public required string MachineId { get; init; }
    public required string OrganeId { get; init; }
    public string? PointId { get; init; }
    public long Horodatage { get; init; }
    public double? Valeur { get; init; }
    public string? Unite { get; init; }
    public double? Seuil { get; init; }
    /// <summary>active | acquittee | resolue</summary>
    public string Statut { get; init; } = "active";
    /// <summary>seuil | derive | repetitif | automate</summary>
    public string Regle { get; init; } = "seuil";
    public string? Cause { get; init; }
    public long? FinLe { get; init; }
    public string? AcquitteePar { get; init; }
    /// <summary>Heure de l'acquittement : du déclenchement à la prise en compte (temps moyen d'acquittement).</summary>
    public long? AcquitteeLe { get; init; }
    public int? Repetitions { get; init; }
}
