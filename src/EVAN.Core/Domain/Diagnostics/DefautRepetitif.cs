using EVAN.Core.Domain.Catalog;

namespace EVAN.Core.Domain.Diagnostics;

/// <summary>Candidat d'un défaut répétitif : la pièce tournante dont le développement correspond au pas mesuré.</summary>
public sealed record CandidatPas(
    int OrganeNumero,
    string OrganeNom,
    string Cylindre,
    string Nature,
    double Circonference,
    double Rapport,
    double PasTheorique,
    double EcartMm,
    double EcartRelatif,
    double Score,
    string Confiance,
    IReadOnlyList<string> MemeDeveloppement);

public sealed record DiagnosticPas(double Pas, double Tolerance, string? Nature, IReadOnlyList<CandidatPas> Candidats);

/// <summary>
/// Défaut répétitif → pièce tournante en cause (même logique que src/EVAN.Front/src/analytics/repeatDefect.ts ;
/// cas de test communs : data/tests/defaut-repetitif.json).
/// Un cylindre ou un rouleau abîmé marque la bande à chaque tour : le pas du défaut est sa circonférence. On compare
/// le pas mesuré aux circonférences des pièces de la machine (table des circonférences des systèmes d'inspection) ;
/// l'aspect du défaut départage les pièces de même développement.
/// </summary>
public static class DefautRepetitif
{
    /// <summary>Tolérance relative par défaut : mesure du pas à ±1 mm, glissement et allongement de la bande.</summary>
    public const double Tolerance = 0.015;

    private const double MemeDeveloppementMax = 0.002;
    private const double AutreNature = 0.35;

    /// <summary>Une marque par tour (cas normal), une sur deux (défaut intermittent), deux par tour (deux poses ou deux points abîmés).</summary>
    private static readonly (double Rapport, double Poids, double Tolerance)[] Rapports = [(1, 1, 1), (2, 0.45, 0.6), (0.5, 0.4, 0.6)];

    public static readonly IReadOnlyDictionary<string, string> NatureLibelle = new Dictionary<string, string>
    {
        ["impression"] = "défaut d'impression (manque, tache, voile)",
        ["decoupe"] = "défaut de découpe (coupe incomplète, bavure)",
        ["marque"] = "marque, rayure ou pli sur la matière",
        ["dorure"] = "défaut de dorure",
    };

    /// <param name="organes">Organes de la machine : numéro, nom, pièces tournantes.</param>
    /// <param name="pas">Écart mesuré entre deux défauts identiques (mm).</param>
    /// <param name="nature">Aspect du défaut, s'il est connu.</param>
    public static DiagnosticPas Diagnostiquer(IEnumerable<(int Numero, string Nom, IReadOnlyList<CylindreDef> Cylindres)> organes, double pas, string? nature = null, double tolerance = Tolerance)
    {
        var candidats = new List<CandidatPas>();
        if (!(pas > 0)) return new DiagnosticPas(pas, tolerance, nature, candidats);
        var pieces = organes.SelectMany(o => o.Cylindres.Select(c => (o, c, C: c.Circonference))).ToList();
        foreach (var (o, c, C) in pieces)
        {
            if (!(C > 0)) continue;
            foreach (var r in Rapports)
            {
                var theorique = C * r.Rapport;
                var ecart = Math.Abs(pas - theorique) / theorique;
                var tol = tolerance * r.Tolerance;
                if (ecart > tol) continue;
                var accord = nature is null || nature == c.Nature ? 1 : AutreNature;
                var score = (1 - ecart / tol) * r.Poids * accord;
                var confiance = r.Rapport == 1 && ecart <= tolerance / 3 && accord == 1 ? "forte" : score >= 0.4 ? "moyenne" : "faible";
                candidats.Add(new CandidatPas(
                    o.Numero, o.Nom, c.Nom, c.Nature,
                    Arrondi(C, 1), r.Rapport, Arrondi(theorique, 1), Arrondi(pas - theorique, 1), Arrondi(ecart, 4), Arrondi(score, 3), confiance,
                    pieces.Where(p => !ReferenceEquals(p.c, c) && Math.Abs(p.C - C) / C <= MemeDeveloppementMax).Select(p => p.c.Nom).ToList()));
            }
        }
        // Tri stable, comme Array.prototype.sort : score décroissant, puis écart croissant.
        var tries = candidats.OrderByDescending(x => x.Score).ThenBy(x => x.EcartRelatif).ToList();
        return new DiagnosticPas(pas, tolerance, nature, tries);
    }

    /// <summary>Diagnostic sur une machine du catalogue (organes du kit, pièces tournantes du catalogue).</summary>
    public static DiagnosticPas Diagnostiquer(MachineModel machine, double pas, string? nature = null) =>
        Diagnostiquer(machine.Organes.Select(o => (o.Numero, o.Nom,
            (IReadOnlyList<CylindreDef>)(machine.Type?.Organes.GetValueOrDefault(o.Numero.ToString())?.Cylindres ?? new List<CylindreDef>()))), pas, nature);

    private static double Arrondi(double v, int d)
    {
        var f = Math.Pow(10, d);
        return Math.Floor(v * f + 0.5) / f;
    }
}
