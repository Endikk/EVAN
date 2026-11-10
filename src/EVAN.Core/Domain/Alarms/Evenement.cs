namespace EVAN.Core.Domain.Alarms;

/// <summary>Événement du journal : changement d'état, alarme, action utilisateur (dont toute autorisation d'écriture).</summary>
public sealed record Evenement(string Id, string Type, long Horodatage, string Message, string? MachineId = null, string? Auteur = null);
