namespace EVAN.Core.Domain.Machines;

// Modèle de données partagé avec le front (miroir de src/EVAN.Front/src/domain/types.ts).

public sealed record ModeleRef(string Url, bool? Personnalise = null);

/// <summary>
/// Machine placée dans un bâtiment : type du catalogue, position (m) et rotation dans le repère du site. CreeLe (ms
/// epoch) date l'ajout d'une machine placée dans l'assistant ; il manque aux machines de l'usine d'exemple. Niveau : 0
/// pour le rez-de-chaussée, 1 pour le premier étage du bâtiment.
/// </summary>
public sealed record Machine(string Id, string BatimentId, string? ZoneId, string Type, string Nom, string Numero, double[] Position, double RotationDeg, ModeleRef Modele, long? CreeLe = null,
    int Niveau = 0);
