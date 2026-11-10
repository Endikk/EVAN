using System.Globalization;
using System.Text;
using Anthropic;
using EVAN.Application.Assistant;
using EVAN.Infrastructure.Assistant;
using Microsoft.Extensions.Configuration;
using Xunit.Abstractions;

namespace EVAN.Infrastructure.Tests.Assistant.Evaluation;

/// <summary>Évaluation contre le vrai modèle : ne tourne qu'avec EVAN_EVAL=1, ignorée par un dotnet test ordinaire.</summary>
public sealed class EvaluationAttribute : FactAttribute
{
    public EvaluationAttribute()
    {
        if (Environment.GetEnvironmentVariable("EVAN_EVAL") != "1") Skip = "Évaluation de l'assistant : appelle le modèle (payant), lancer avec EVAN_EVAL=1 et ANTHROPIC_API_KEY.";
    }
}

/// <summary>
/// Pose les questions du jeu (data/tests/assistant-questions.json) à l'assistant, avec le pipeline de production
/// (cache, effort, repli), note chaque réponse et écrit un rapport : score, jetons, coût.
/// <c>EVAN_EVAL=1 dotnet test tests/EVAN.Infrastructure.Tests -c Release --filter "FullyQualifiedName~EvaluationAssistant" --logger "console;verbosity=detailed"</c>
/// Réglages par variables d'environnement : ANTHROPIC_API_KEY (obligatoire, jamais écrite ailleurs), EVAN_EVAL_MODELE
/// (défaut claude-opus-5-5), EVAN_EVAL_EFFORT (low, medium, high, xhigh, max ; défaut : celui du modèle),
/// EVAN_EVAL_QUESTIONS (identifiants séparés par des virgules, pour n'en poser que quelques-unes), EVAN_EVAL_SORTIE
/// (dossier du rapport ; défaut : evaluation/ à côté des binaires de test), EVAN_EVAL_SEUIL (score minimal, entre 0 et 1,
/// en dessous duquel le test échoue ; sans seuil, il mesure seulement).
/// </summary>
public class EvaluationAssistant(ITestOutputHelper sortie)
{
    /// <summary>Une question posée : sa note, la réponse, les outils appelés, le bilan (jetons, coût).</summary>
    internal sealed record Resultat(QuestionEvaluation Question, Note Note, string Reponse, IReadOnlyList<string> Outils, BilanQuestion? Bilan);

    private static string? Env(string nom) => Environment.GetEnvironmentVariable(nom) is { Length: > 0 } v ? v : null;

    [Evaluation]
    public async Task Evaluer_l_assistant_sur_le_jeu_de_questions()
    {
        var cle = Env("ANTHROPIC_API_KEY") ?? throw new InvalidOperationException("EVAN_EVAL=1 demande ANTHROPIC_API_KEY dans l'environnement.");
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Evan:Assistant:Modele"] = Env("EVAN_EVAL_MODELE"),
            ["Evan:Assistant:Effort"] = Env("EVAN_EVAL_EFFORT"),
        }).Build();
        var reglages = AssistantRegistration.Lire(config);
        var jeu = JeuEvaluation.Charger();
        var usine = new UsineFigee(jeu.Maintenant);
        var assistant = new AssistantService(
            usine.Outils, UsineFigee.Data,
            AssistantRegistration.CreerClient(new AnthropicClient { ApiKey = cle }, reglages),
            new AssistantOptions(reglages.Modele, reglages.EffortTexte, reglages.Tarif));

        var choisies = Env("EVAN_EVAL_QUESTIONS")?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet();
        var questions = jeu.Questions.Where(q => choisies is null || choisies.Contains(q.Id)).ToList();
        Assert.NotEmpty(questions);

        var resultats = await Poser(assistant, usine, questions, r => sortie.WriteLine(Ligne(r)));
        var rapport = Rapport(reglages.Modele, reglages.EffortTexte, resultats);
        var dossier = Env("EVAN_EVAL_SORTIE") ?? Path.Combine(AppContext.BaseDirectory, "evaluation");
        Directory.CreateDirectory(dossier);
        var fichier = Path.Combine(dossier, $"assistant-{reglages.Modele}-{reglages.EffortTexte ?? "defaut"}-{DateTime.UtcNow:yyyyMMdd-HHmmss}.md");
        await File.WriteAllTextAsync(fichier, rapport);
        sortie.WriteLine(rapport);
        sortie.WriteLine($"Rapport : {fichier}");

        if (Env("EVAN_EVAL_SEUIL") is { } seuil)
            Assert.True(resultats.Average(r => r.Note.Score) >= double.Parse(seuil, CultureInfo.InvariantCulture), $"Score sous le seuil {seuil} : voir {fichier}");
    }

    /// <summary>
    /// Pose les questions l'une après l'autre (la deuxième relit dans le cache les outils et les consignes de la
    /// première), à l'instant figé de l'usine, et note chaque réponse.
    /// </summary>
    internal static async Task<List<Resultat>> Poser(AssistantService assistant, UsineFigee usine, IEnumerable<QuestionEvaluation> questions, Action<Resultat>? suivi = null)
    {
        var resultats = new List<Resultat>();
        foreach (var q in questions)
        {
            var attendus = await JeuEvaluation.Calculer(q, usine.Outils);
            var texte = new StringBuilder();
            var outils = new List<string>();
            BilanQuestion? bilan = null;
            await foreach (var e in assistant.RepondreAsync(q.Usine, [new MessageAssistant("user", q.Question)], usine.Maintenant))
            {
                if (e.Type == "texte") texte.Append(e.Texte);
                else if (e.Type == "outil") outils.Add(e.Outil!);
                else if (e.Type == "bilan") bilan = e.Bilan;
            }
            var resultat = new Resultat(q, Correcteur.Noter(attendus, texte.ToString()), texte.ToString(), outils, bilan);
            resultats.Add(resultat);
            suivi?.Invoke(resultat);
        }
        return resultats;
    }

    private static string Dollars(decimal? d) => d is { } v ? v.ToString("0.0000", CultureInfo.InvariantCulture) + " $" : "inconnu";

    private static string Pourcent(double part) => (part * 100).ToString("0.#", CultureInfo.InvariantCulture) + " %";

    private static string Ligne(Resultat r)
    {
        var c = r.Bilan?.Consommation ?? ConsommationAssistant.Aucune;
        return $"{r.Question.Id} : {Pourcent(r.Note.Score)}, allers-retours {c.AllersRetours}, entrée {c.Entree}, sortie {c.Sortie}, écriture cache {c.EcritureCache}, lecture cache {c.LectureCache}, coût {Dollars(r.Bilan?.CoutDollars)}";
    }

    /// <summary>Rapport en Markdown : score, jetons et coût en tête, une ligne par question, puis le détail des échecs.</summary>
    internal static string Rapport(string modele, string? effort, IReadOnlyList<Resultat> resultats)
    {
        var total = resultats.Select(r => r.Bilan?.Consommation ?? ConsommationAssistant.Aucune).Aggregate(ConsommationAssistant.Aucune, (a, b) => a.Plus(b));
        decimal? cout = resultats.All(r => r.Bilan?.CoutDollars is not null) ? resultats.Sum(r => r.Bilan!.CoutDollars!.Value) : null;
        var sb = new StringBuilder();
        sb.AppendLine($"# Évaluation de l'assistant : {modele}, effort {effort ?? "par défaut"}");
        sb.AppendLine();
        sb.AppendLine($"Questions réussies : {resultats.Count(r => r.Note.Reussie)} sur {resultats.Count}. Score moyen : {Pourcent(resultats.Average(r => r.Note.Score))}.");
        sb.AppendLine($"Jetons : entrée {total.Entree}, sortie {total.Sortie}, écriture cache {total.EcritureCache}, lecture cache {total.LectureCache}, allers-retours {total.AllersRetours}.");
        sb.AppendLine($"Coût estimé : {Dollars(cout)}, soit {Dollars(cout / resultats.Count)} par question.");
        sb.AppendLine();
        sb.AppendLine("| Question | Score | Outils | Allers-retours | Entrée | Sortie | Écriture cache | Lecture cache | Coût |");
        sb.AppendLine("|---|---|---|---|---|---|---|---|---|");
        foreach (var r in resultats)
        {
            var c = r.Bilan?.Consommation ?? ConsommationAssistant.Aucune;
            sb.AppendLine($"| {r.Question.Id} | {Pourcent(r.Note.Score)} | {string.Join(", ", r.Outils)} | {c.AllersRetours} | {c.Entree} | {c.Sortie} | {c.EcritureCache} | {c.LectureCache} | {Dollars(r.Bilan?.CoutDollars)} |");
        }
        foreach (var r in resultats.Where(r => !r.Note.Reussie))
        {
            sb.AppendLine();
            sb.AppendLine($"## {r.Question.Id} : {r.Question.Question}");
            foreach (var v in r.Note.Verifications.Where(v => !v.Reussie)) sb.AppendLine($"- manque {v.Quoi} = {v.Attendu}");
            sb.AppendLine();
            sb.AppendLine("> " + r.Reponse.ReplaceLineEndings("\n> "));
        }
        return sb.ToString();
    }
}
