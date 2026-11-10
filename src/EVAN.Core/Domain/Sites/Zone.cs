namespace EVAN.Core.Domain.Sites;

/// <summary>
/// Zone d'un bâtiment (atelier, stock, expédition…), polygone en mètres dans le repère du site. Niveau : 0 pour le
/// rez-de-chaussée (valeur des usines relevées avant les étages), 1 pour le premier étage.
/// </summary>
public sealed record Zone(string Id, string BatimentId, string Nom, string Type, double[][] Polygone, int Niveau = 0);
