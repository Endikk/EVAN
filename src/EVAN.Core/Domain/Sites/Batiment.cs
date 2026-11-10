namespace EVAN.Core.Domain.Sites;

/// <summary>Emprise relevée : contour lon/lat, précision de chaque sommet (σ en m), source (bdtopo, osm, manuel).</summary>
public sealed record Batiment(
    string Id,
    string SiteId,
    string Nom,
    double[][] Contour,
    double[] Sigmas,
    double Hauteur,
    int Niveaux,
    string Source,
    string? SourceRef = null,
    string? Rnb = null,
    string? Usage = null,
    double? PrecisionSource = null);
