namespace EVAN.Core.Domain.Machines;

public sealed record Seuils(double? AlarmeBas = null, double? AttentionBas = null, double? AttentionHaut = null, double? AlarmeHaut = null);

/// <summary>Point de mesure d'un organe. Protocole et adresse de la variable de l'automate, une fois associée (étape 5).</summary>
public sealed record PointDeMesure(string Id, string MachineId, string OrganeId, string Cle, string Libelle, string Type, string Unite, double Nominal, Seuils Seuils, string? Protocole = null, string? Adresse = null);
