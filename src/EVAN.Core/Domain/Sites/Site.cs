namespace EVAN.Core.Domain.Sites;

// Modèle de données partagé avec le front (miroir de src/EVAN.Front/src/domain/types.ts).

/// <summary>Repère local du site : origine lon/lat et angle qui aligne x sur le grand côté du bâtiment.</summary>
public sealed record Repere(double[] Origin, double AngleDeg);

/// <summary>
/// Une usine de l'organisation. Chaque site a sa propre passerelle edge (connexion sortante vers le broker) ;
/// la surface annoncée par l'entreprise, si on la connaît, sert de point de comparaison au relevé.
/// </summary>
public sealed record Site(
    string Id,
    string OrganisationId,
    string Nom,
    string Adresse,
    double[] Coordonnees,
    Repere Repere,
    string? Siret = null,
    string? Passerelle = null,
    double? SurfaceAnnoncee = null);
