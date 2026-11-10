using EVAN.Core.Domain.Machines;

namespace EVAN.Core.Domain.Catalog;

// ---------- Catalogue EVAN (data/catalog.json) : enrichissement du kit, organe par organe ----------

public sealed class MesureDef
{
    public required string Cle { get; init; }
    public required string Libelle { get; init; }
    public required string Type { get; init; }
    public string Unite { get; init; } = "";
    public double Nominal { get; init; }
    public double Bruit { get; init; }
    public Seuils Seuils { get; init; } = new();
    public string? Dynamique { get; init; }
    public string? Role { get; init; }
}

public sealed class PanneDef
{
    public required string Mesure { get; init; }
    public required string Forme { get; init; }
    public double Cible { get; init; }
    public double Duree { get; init; }
    public required string Cause { get; init; }
    /// <summary>Intervention type qui remet la machine en état (compte rendu du carnet de maintenance).</summary>
    public string? Action { get; init; }
    public Dictionary<string, double>? Lie { get; init; }
}

/// <summary>Pièce tournante d'un organe : diamètre ou développement (circonférence) en mm, et l'aspect du défaut qu'elle laisse.</summary>
public sealed class CylindreDef
{
    public required string Nom { get; init; }
    /// <summary>impression | decoupe | marque | dorure</summary>
    public required string Nature { get; init; }
    public double? Diametre { get; init; }
    public double? Developpement { get; init; }

    public double Circonference => Developpement ?? Math.PI * (Diametre ?? 0);
}

public sealed class OrganeCatalogue
{
    public List<MesureDef> Mesures { get; init; } = new();
    public PanneDef? Panne { get; init; }
    public List<CylindreDef> Cylindres { get; init; } = new();
}

public sealed record Vitesse(double Nominale, double Max, string Unite);

/// <summary>Puissance électrique appelée par état de la machine (kW).</summary>
public sealed record ProfilEnergie(double Marche, double Calage, double Panne, double Arret)
{
    /// <summary>Profil d'une machine hors catalogue.</summary>
    public static readonly ProfilEnergie Inconnu = new(10, 5, 3, 0.5);

    public double Pour(string etat) => etat switch
    {
        "marche" or "attention" => Marche,
        "calage" => Calage,
        "panne" => Panne,
        _ => Arret,
    };
}

/// <summary>
/// Tâche du plan de maintenance (NF EN 13306) : systématique, à intervalle d'heures de marche (h) ou de jours (j),
/// ou conditionnelle, déclenchée par les seuils d'un point de mesure d'usure.
/// </summary>
public sealed class TacheDef
{
    public required string Id { get; init; }
    public int Organe { get; init; }
    public required string Tache { get; init; }
    /// <summary>systematique | conditionnelle</summary>
    public required string Nature { get; init; }
    public double? Intervalle { get; init; }
    /// <summary>h | j</summary>
    public string? Unite { get; init; }
    /// <summary>Clé du point de mesure suivi (maintenance conditionnelle).</summary>
    public string? Point { get; init; }
    /// <summary>Durée d'intervention prévue (min).</summary>
    public double Duree { get; init; }
}

public sealed class TypeCatalogue
{
    public required string Libelle { get; init; }
    public required string Prefixe { get; init; }
    public required string Categorie { get; init; }
    public required Vitesse Vitesse { get; init; }
    public ProfilEnergie Energie { get; init; } = ProfilEnergie.Inconnu;
    public List<TacheDef> Maintenance { get; init; } = new();
    public Dictionary<string, OrganeCatalogue> Organes { get; init; } = new();
}

/// <summary>Paramètres énergétiques par défaut : facteur d'émission (kgCO₂e/kWh) et prix (€/kWh), avec leur source.</summary>
public sealed record ParametresEnergie(double FacteurCo2, double PrixKwh, string? SourceCo2 = null, string? SourcePrix = null);

public sealed class Catalogue
{
    public Dictionary<string, TypeCatalogue> Types { get; init; } = new();
    public ParametresEnergie Energie { get; init; } = new(0.04, 0.15);
}
