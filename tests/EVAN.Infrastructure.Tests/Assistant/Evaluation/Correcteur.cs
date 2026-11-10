using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace EVAN.Infrastructure.Tests.Assistant.Evaluation;

/// <summary>Une vérification sur une réponse : ce qui est cherché, la valeur attendue, trouvée ou non.</summary>
public sealed record Verification(string Quoi, string Attendu, bool Reussie);

/// <summary>Note d'une réponse : part des vérifications réussies ; la question est réussie si toutes le sont.</summary>
public sealed record Note(string Id, IReadOnlyList<Verification> Verifications)
{
    public double Score => Verifications.Count == 0 ? 1 : (double)Verifications.Count(v => v.Reussie) / Verifications.Count;
    public bool Reussie => Verifications.All(v => v.Reussie);
}

/// <summary>
/// Correcteur des réponses de l'assistant, sans appel au modèle : il cherche dans le texte les valeurs calculées par les
/// outils d'EVAN. Les nombres s'écrivent à la française (73,6 % ; 35 840,8 kWh, l'espace pouvant être insécable ou
/// fine) ou à l'anglaise (73.6), une durée aussi en « 3 h 31 ». Les identifiants (R01, EM-01) et les cibles de liens
/// ([R01](machine:m-r01)) ne comptent pas comme des nombres.
/// </summary>
public static class Correcteur
{
    private static readonly Regex CibleDeLien = new(@"\]\([^)]*\)", RegexOptions.Compiled);

    // Nombre isolé : ni collé à une lettre ou à un chiffre (R01), ni suffixe d'un code (EM-01) ; milliers séparés par une
    // espace (normale, insécable ou fine insécable) ; décimale après une virgule ou un point ; signe - ou −.
    private static readonly Regex Nombre = new(
        @"(?<![\p{L}\p{N}_][-‑−]?)(?<![.,])([-−]?)(\d{1,3}(?:[   ]\d{3})+(?!\d)|\d+)(?:[.,](\d+))?",
        RegexOptions.Compiled);

    // Durée composée : « 3 h 31 », « 3h31 », « 1 h 05 min ».
    private static readonly Regex Duree = new(@"(?<![\p{L}\p{N}])(\d+)\s*h\s*(\d{1,2})(?!\d)", RegexOptions.Compiled);

    /// <summary>Les nombres du texte, plus chaque durée composée lue en heures et en minutes.</summary>
    public static IReadOnlyList<double> Nombres(string texte)
    {
        var t = CibleDeLien.Replace(texte, "]");
        var nombres = new List<double>();
        foreach (Match m in Nombre.Matches(t))
        {
            var entier = Regex.Replace(m.Groups[2].Value, @"[   ]", "");
            var v = double.Parse(m.Groups[3].Success ? $"{entier}.{m.Groups[3].Value}" : entier, CultureInfo.InvariantCulture);
            nombres.Add(m.Groups[1].Length > 0 ? -v : v);
        }
        foreach (Match m in Duree.Matches(t))
        {
            var (h, min) = (int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture), int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture));
            nombres.Add(h + min / 60.0);
            nombres.Add(h * 60 + min);
        }
        return nombres;
    }

    /// <summary>Écritures acceptées d'une valeur : une durée en heures se dit aussi en minutes, une énergie en kWh aussi en MWh.</summary>
    public static IReadOnlyList<double> Echelles(string? unite) => unite switch
    {
        null => [1],
        "h" => [1, 60],
        "min" => [1, 1.0 / 60],
        "kWh" => [1, 0.001],
        _ => throw new ArgumentException($"Unité « {unite} » inconnue : h, min ou kWh."),
    };

    /// <summary>
    /// Le nombre est-il dans le texte, à la tolérance relative près, dans une de ses unités ? On compare des valeurs
    /// absolues : « baisse de 1,3 % par jour » répond bien à une variation de −1,35.
    /// </summary>
    public static bool ContientNombre(IReadOnlyList<double> nombres, NombreAttendu n) =>
        Echelles(n.Unite).Any(e => nombres.Any(x => Math.Abs(Math.Abs(x) - Math.Abs(n.Valeur * e)) <= n.Tolerance * Math.Abs(n.Valeur * e) + 1e-9));

    /// <summary>Texte attendu présent, sans tenir compte de la casse, des accents ni des apostrophes typographiques.</summary>
    public static bool ContientTexte(string texte, string attendu) => Plier(texte).Contains(Plier(attendu), StringComparison.Ordinal);

    /// <summary>Machine citée par son lien (machine:m-r07) ou par son numéro isolé (R07, pas R070).</summary>
    public static bool NommeMachine(string texte, MachineAttendue m) =>
        texte.Contains($"machine:{m.Id}", StringComparison.Ordinal)
        || Regex.IsMatch(texte, $@"(?<![\p{{L}}\p{{N}}]){Regex.Escape(m.Numero)}(?!\p{{N}})", RegexOptions.IgnoreCase);

    public static Note Noter(Attendus attendus, string reponse)
    {
        var nombres = Nombres(reponse);
        List<Verification> v =
        [
            .. attendus.Nombres.Select(n => new Verification($"nombre {n.Chemin}", $"{n.Valeur.ToString(CultureInfo.InvariantCulture)}{(n.Unite is null ? "" : " " + n.Unite)}", ContientNombre(nombres, n))),
            .. attendus.Textes.Select(t => new Verification($"texte {t.Chemin}", t.Valeur, ContientTexte(reponse, t.Valeur))),
            .. attendus.Machines.Select(m => new Verification($"machine {m.Chemin}", m.Numero, NommeMachine(reponse, m))),
        ];
        return new Note(attendus.Id, v);
    }

    private static string Plier(string s)
    {
        var sb = new StringBuilder(s.Length);
        foreach (var c in s.ToLowerInvariant())
        {
            sb.Append(c switch
            {
                'à' or 'â' or 'ä' => 'a',
                'é' or 'è' or 'ê' or 'ë' => 'e',
                'î' or 'ï' => 'i',
                'ô' or 'ö' => 'o',
                'ù' or 'û' or 'ü' => 'u',
                'ç' => 'c',
                '’' or '‘' => '\'',
                ' ' or ' ' => ' ',
                _ => c,
            });
        }
        return sb.ToString();
    }
}
