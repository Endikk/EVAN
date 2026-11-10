namespace EVAN.Simulator.Configuration;

/// <summary>Configuration du simulateur (appsettings.json, section « Simulator »).</summary>
public sealed class SimulatorOptions
{
    /// <summary>Usines simulées (identifiants de site) ; vide = toutes les usines d'exemple.</summary>
    public List<string> Sites { get; set; } = new();
    /// <summary>
    /// Le simulateur joue aussi la passerelle de démonstration de chaque usine (réponses aux tests de liaison) :
    /// celle déclarée par le site, sinon celle-ci.
    /// </summary>
    public string DefaultGateway { get; set; } = "demo-01";
    public int PeriodMs { get; set; } = 1000;
    /// <summary>Machines alimentées par une vraie passerelle (profil edge) : le simulateur ne les publie pas.</summary>
    public List<string> Exclude { get; set; } = new();
}
