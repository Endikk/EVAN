namespace EVAN.Core.Domain.Sites;

/// <summary>Zone d'un bâtiment (atelier, stock, expédition…), polygone en mètres dans le repère du site.</summary>
public sealed record Zone(string Id, string BatimentId, string Nom, string Type, double[][] Polygone);
