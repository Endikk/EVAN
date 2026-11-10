namespace EVAN.Core.Contracts;

/// <summary>État de production publié par la passerelle (ou le simulateur).</summary>
public sealed class StateMessage
{
    public string Schema { get; init; } = "evan.state/1";
    public required string SiteId { get; init; }
    public required string MachineId { get; init; }
    public DateTimeOffset Ts { get; init; }
    /// <summary>marche | calage | arret</summary>
    public required string Etat { get; init; }
    public double Vitesse { get; init; }
    public double Facteur { get; init; }
    public double Bonnes { get; init; }
    public double Gache { get; init; }
}
