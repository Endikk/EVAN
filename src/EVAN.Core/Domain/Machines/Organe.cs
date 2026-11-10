namespace EVAN.Core.Domain.Machines;

/// <summary>Organe d'une machine (rouleau, groupe d'impression…), relié au nœud 3D diag_N_nom du modèle.</summary>
public sealed record Organe(string Id, string MachineId, int Numero, string Nom, string? Noeud3d, double[]? Position, string? Methode, string? AlarmeCode, string? AlarmeMessage);
