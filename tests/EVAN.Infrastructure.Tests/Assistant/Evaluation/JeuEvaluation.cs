using System.Text.Json;
using System.Text.RegularExpressions;
using EVAN.Application.Assistant;
using Microsoft.Extensions.AI;

namespace EVAN.Infrastructure.Tests.Assistant.Evaluation;

/// <summary>Un nombre à retrouver dans la réponse : chemin dans la réponse de l'outil, tolérance relative, unité.</summary>
public sealed record VerificationNombre(string Chemin, double? Tolerance, string? Unite);

/// <summary>Un appel d'outil d'EVAN qui calcule la bonne réponse, et ce qu'il faut en retrouver dans le texte du modèle.</summary>
public sealed record Calcul(
    string Outil,
    Dictionary<string, JsonElement>? Arguments,
    List<VerificationNombre>? Nombres,
    List<string>? Textes,
    List<string>? Machines);

public sealed record QuestionEvaluation(string Id, string Usine, string Question, List<Calcul> Calculs);

public sealed record NombreAttendu(string Chemin, double Valeur, double Tolerance, string? Unite);

public sealed record TexteAttendu(string Chemin, string Valeur);

public sealed record MachineAttendue(string Chemin, string Id, string Numero);

/// <summary>Ce que la réponse doit contenir, calculé par les outils d'EVAN à l'instant figé du jeu.</summary>
public sealed record Attendus(string Id, IReadOnlyList<NombreAttendu> Nombres, IReadOnlyList<TexteAttendu> Textes, IReadOnlyList<MachineAttendue> Machines)
{
    public int Verifications => Nombres.Count + Textes.Count + Machines.Count;
}

/// <summary>
/// Jeu d'évaluation de l'assistant (data/tests/assistant-questions.json). Les bonnes réponses n'y sont pas écrites :
/// elles sont recalculées ici par les outils d'EVAN (les mêmes que ceux que le modèle appelle), sur l'historique simulé
/// à l'instant figé du jeu, qui est déterministe.
/// </summary>
public sealed record JeuEvaluation(string Description, long Maintenant, List<QuestionEvaluation> Questions)
{
    /// <summary>Tolérance relative par défaut : un modèle arrondit (73,6 % devient rarement 75 %).</summary>
    public const double ToleranceParDefaut = 0.02;

    private static readonly JsonSerializerOptions Lecture = new(JsonSerializerDefaults.Web);

    public static JeuEvaluation Charger() =>
        JsonSerializer.Deserialize<JeuEvaluation>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "data", "tests", "assistant-questions.json")), Lecture)
        ?? throw new InvalidDataException("assistant-questions.json vide.");

    /// <summary>Réponse d'un outil telle que la reçoit le modèle (JSON), pour des arguments donnés.</summary>
    public static async Task<JsonElement> Appeler(EvanTools outils, string outil, IReadOnlyDictionary<string, JsonElement>? arguments)
    {
        var fonction = outils.Fonctions().SingleOrDefault(f => f.Name == outil) ?? throw new KeyNotFoundException($"Outil « {outil} » inconnu.");
        var args = new AIFunctionArguments((arguments ?? new Dictionary<string, JsonElement>()).ToDictionary(a => a.Key, a => (object?)a.Value));
        var resultat = await fonction.InvokeAsync(args);
        return resultat is JsonElement json ? json : JsonSerializer.SerializeToElement(resultat, EvanTools.JsonOutils);
    }

    public static async Task<Attendus> Calculer(QuestionEvaluation q, EvanTools outils)
    {
        List<NombreAttendu> nombres = [];
        List<TexteAttendu> textes = [];
        List<MachineAttendue> machines = [];
        foreach (var c in q.Calculs)
        {
            var reponse = await Appeler(outils, c.Outil, c.Arguments);
            if (reponse.ValueKind == JsonValueKind.Object && reponse.TryGetProperty("erreur", out var erreur))
                throw new InvalidDataException($"{q.Id} : l'outil {c.Outil} répond « {erreur} ».");
            nombres.AddRange((c.Nombres ?? []).Select(n => new NombreAttendu(n.Chemin, Lire(reponse, n.Chemin).GetDouble(), n.Tolerance ?? ToleranceParDefaut, n.Unite)));
            textes.AddRange((c.Textes ?? []).Select(t => new TexteAttendu(t, Lire(reponse, t).GetString()!)));
            machines.AddRange((c.Machines ?? []).Select(m =>
            {
                var machine = Lire(reponse, m);
                return new MachineAttendue(m, machine.GetProperty("id").GetString()!, machine.GetProperty("numero").GetString()!);
            }));
        }
        return new Attendus(q.Id, nombres, textes, machines);
    }

    private static readonly Regex Segment = new(@"\[(\d+)\]|\[([^=\]]+)=([^\]]+)\]|([^.\[\]]+)", RegexOptions.Compiled);

    /// <summary>
    /// Valeur au bout d'un chemin : propriétés séparées par des points, [n] pour le n-ième élément d'une liste,
    /// [cle=valeur] pour le premier élément dont la propriété vaut ce texte (gisements[type=veille].eurosParAn).
    /// </summary>
    public static JsonElement Lire(JsonElement racine, string chemin)
    {
        var courant = racine;
        foreach (Match m in Segment.Matches(chemin))
        {
            courant = m switch
            {
                _ when m.Groups[1].Success => Element(courant, chemin, int.Parse(m.Groups[1].Value)),
                _ when m.Groups[2].Success => courant.EnumerateArray().FirstOrDefault(e =>
                        e.TryGetProperty(m.Groups[2].Value, out var v) && v.ValueKind == JsonValueKind.String && v.GetString() == m.Groups[3].Value) is { ValueKind: not JsonValueKind.Undefined } trouve
                    ? trouve
                    : throw new KeyNotFoundException($"{chemin} : aucun élément avec {m.Groups[2].Value}={m.Groups[3].Value}."),
                _ => courant.TryGetProperty(m.Groups[4].Value, out var p) ? p : throw new KeyNotFoundException($"{chemin} : propriété « {m.Groups[4].Value} » absente."),
            };
        }
        return courant;
    }

    private static JsonElement Element(JsonElement liste, string chemin, int i) =>
        i < liste.GetArrayLength() ? liste[i] : throw new KeyNotFoundException($"{chemin} : moins de {i + 1} éléments.");
}
