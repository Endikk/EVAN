namespace EVAN.Core.Contracts;

/// <summary>Une mesure : identifiant de point EVAN, valeur, qualité OPC UA simplifiée.</summary>
public sealed record Metric(string Point, double Value, string? Unit = null, string Quality = "good", DateTimeOffset? Ts = null);

/// <summary>
/// Télémétrie d'une machine (schéma evan.telemetry/1). Ts = horodatage source (automate) ;
/// Trace = horodatages intermédiaires facultatifs (automate, passerelle) pour mesurer la latence de bout en bout.
/// </summary>
public sealed class TelemetryMessage
{
    public string Schema { get; init; } = "evan.telemetry/1";
    public required string SiteId { get; init; }
    public required string MachineId { get; init; }
    public string? GatewayId { get; init; }
    public long Seq { get; init; }
    public DateTimeOffset Ts { get; init; }
    public required IReadOnlyList<Metric> Metrics { get; init; }
    public Dictionary<string, DateTimeOffset>? Trace { get; init; }
}
