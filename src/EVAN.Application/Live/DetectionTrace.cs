namespace EVAN.Application.Live;

/// <summary>Une étape horodatée du parcours d'un défaut : capteur, automate, passerelle, MQTT, règles, alarme, écran.</summary>
public sealed record TraceStep(string Etape, string Libelle, long T, string? Detail = null);

/// <summary>Trace de détection de bout en bout d'une panne (affichée par le front, étape par étape).</summary>
public sealed record DetectionTrace
{
    public required string Id { get; init; }
    public required string MachineId { get; init; }
    public required string OrganeId { get; init; }
    public string? Code { get; init; }
    public long Debut { get; init; }
    public List<TraceStep> Steps { get; init; } = new();
    public bool Termine { get; init; }
    public bool Simule => false;
}
