using System.Globalization;
using EVAN.Application.Assistant;
using Microsoft.Extensions.AI;

namespace EVAN.Infrastructure.Tests.Assistant.Evaluation;

/// <summary>
/// Le jeu d'évaluation lui-même, sans modèle : chaque question se calcule sur l'historique simulé, toujours à l'identique,
/// et le correcteur donne la note maximale à une réponse qui reprend les valeurs attendues, aucune à une réponse fausse.
/// </summary>
public class JeuEvaluationTests
{
    private static readonly JeuEvaluation Jeu = JeuEvaluation.Charger();

    public static TheoryData<string> Questions => [.. Jeu.Questions.Select(q => q.Id)];

    private static QuestionEvaluation Question(string id) => Jeu.Questions.Single(q => q.Id == id);

    /// <summary>Nombre à la française : milliers séparés par une espace fine insécable, virgule décimale.</summary>
    private static string Francais(double v)
    {
        var s = Math.Round(Math.Abs(v), 3).ToString("#,0.###", CultureInfo.InvariantCulture).Replace(",", " ").Replace('.', ',');
        return v < 0 ? "−" + s : s;
    }

    /// <summary>Réponse écrite à partir des valeurs attendues, multipliées par un facteur (1 : la bonne réponse).</summary>
    private static string Reponse(Attendus a, double facteur, bool bonnesMachines) =>
        string.Join(" ; ", [
            .. a.Nombres.Select(n => Francais(n.Valeur * facteur) + (n.Unite is null ? "" : " " + n.Unite)),
            .. a.Textes.Select(t => bonnesMachines ? t.Valeur : "autre chose"),
            .. a.Machines.Select(m => bonnesMachines ? $"[{m.Numero}](machine:{m.Id})" : "[X99](machine:m-x99)"),
        ]);

    [Fact]
    public void Le_jeu_pose_de_15_a_20_questions_d_atelier_aux_identifiants_uniques()
    {
        Assert.InRange(Jeu.Questions.Count, 15, 20);
        Assert.Equal(Jeu.Questions.Count, Jeu.Questions.Select(q => q.Id).Distinct().Count());
        Assert.All(Jeu.Questions, q => Assert.NotEmpty(q.Calculs));
        Assert.All(Jeu.Questions, q => Assert.Contains(q.Usine, UsineFigee.Data.Demo.Usines.Select(u => u.Site.Id)));
        var outils = EvanTools.Methodes.Select(m => m.Outil.Nom).ToHashSet();
        Assert.All(Jeu.Questions.SelectMany(q => q.Calculs), c => Assert.Contains(c.Outil, outils));
    }

    [Theory]
    [MemberData(nameof(Questions))]
    public async Task Chaque_question_se_calcule_sur_l_historique_simule_toujours_a_l_identique(string id)
    {
        var attendus = await JeuEvaluation.Calculer(Question(id), new UsineFigee(Jeu.Maintenant).Outils);
        var encore = await JeuEvaluation.Calculer(Question(id), new UsineFigee(Jeu.Maintenant).Outils);

        Assert.True(attendus.Verifications > 0);
        Assert.All(attendus.Nombres, n => Assert.True(double.IsFinite(n.Valeur)));
        Assert.All(attendus.Textes, t => Assert.False(string.IsNullOrWhiteSpace(t.Valeur)));
        Assert.Equal(attendus.Nombres, encore.Nombres);
        Assert.Equal(attendus.Textes, encore.Textes);
        Assert.Equal(attendus.Machines, encore.Machines);
    }

    [Theory]
    [MemberData(nameof(Questions))]
    public async Task Une_reponse_qui_reprend_les_valeurs_attendues_est_notee_juste_et_une_reponse_fausse_ne_l_est_pas(string id)
    {
        var attendus = await JeuEvaluation.Calculer(Question(id), new UsineFigee(Jeu.Maintenant).Outils);

        Assert.True(Correcteur.Noter(attendus, Reponse(attendus, 1, bonnesMachines: true)).Reussie);
        // Valeurs décalées de 10 %, au-delà de toutes les tolérances du jeu, et machines ou textes faux.
        Assert.Equal(0, Correcteur.Noter(attendus, Reponse(attendus, 1.1, bonnesMachines: false)).Score);
    }

    /// <summary>Modèle simulé : une réponse écrite d'avance par question, et un décompte de jetons fixe par appel.</summary>
    private sealed class ModeleSimule(IReadOnlyDictionary<string, string> reponses) : IChatClient
    {
        public Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
            throw new NotSupportedException();

        public async IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken cancellationToken = default)
        {
            await Task.Yield();
            yield return new ChatResponseUpdate(ChatRole.Assistant, reponses[messages.Last().Text]);
            yield return new ChatResponseUpdate(ChatRole.Assistant, [new UsageContent(new UsageDetails { InputTokenCount = 3000, CachedInputTokenCount = 2500, OutputTokenCount = 400 })]);
        }

        public object? GetService(Type serviceType, object? serviceKey = null) => null;
        public void Dispose() { }
    }

    [Fact]
    public async Task L_evaluation_note_chaque_question_et_rend_un_rapport_avec_les_jetons_et_le_cout()
    {
        var usine = new UsineFigee(Jeu.Maintenant);
        var (juste, fausse) = (Question("trs-r07"), Question("defaut-repetitif-r01"));
        var attendus = await JeuEvaluation.Calculer(juste, usine.Outils);
        var modele = new ModeleSimule(new Dictionary<string, string>
        {
            [juste.Question] = Reponse(attendus, 1, bonnesMachines: true),
            [fausse.Question] = "Regardez le cylindre magnétique de la R02.",
        });
        var tarif = new TarifModele(Entree: 4m, Sortie: 20m, LectureCache: 0.20m, EcritureCache: 5m);
        var assistant = new AssistantService(usine.Outils, UsineFigee.Data, modele, new AssistantOptions("claude-opus-5-5", null, tarif));

        var resultats = await EvaluationAssistant.Poser(assistant, usine, [juste, fausse]);
        var rapport = EvaluationAssistant.Rapport("claude-opus-5-5", null, resultats);

        Assert.Equal([true, false], resultats.Select(r => r.Note.Reussie));
        Assert.Contains("Questions réussies : 1 sur 2. Score moyen : 50 %.", rapport);
        // 500 jetons au plein tarif, 2 500 lus en cache, 400 en sortie, deux fois.
        Assert.Contains("Jetons : entrée 1000, sortie 800, écriture cache 0, lecture cache 5000, allers-retours 2.", rapport);
        Assert.Contains($"Coût estimé : {2 * (500 * 4m + 2500 * 0.20m + 400 * 20m) / 1_000_000m:0.0000} $", rapport);
        Assert.Contains("## defaut-repetitif-r01", rapport);
        Assert.Contains("- manque texte candidats[0].piece = Anilox G3", rapport);
    }

    [Fact]
    public void Un_chemin_lit_une_propriete_un_rang_ou_le_premier_element_qui_correspond()
    {
        var json = System.Text.Json.JsonDocument.Parse("""{"gisements":[{"type":"calage","euros":1},{"type":"veille","euros":2}],"liste":[{"a":{"b":3}}]}""").RootElement;
        Assert.Equal(2, JeuEvaluation.Lire(json, "gisements[type=veille].euros").GetInt32());
        Assert.Equal(3, JeuEvaluation.Lire(json, "liste[0].a.b").GetInt32());
        Assert.Throws<KeyNotFoundException>(() => JeuEvaluation.Lire(json, "gisements[type=panne].euros"));
        Assert.Throws<KeyNotFoundException>(() => JeuEvaluation.Lire(json, "liste[1].a"));
        Assert.Throws<KeyNotFoundException>(() => JeuEvaluation.Lire(json, "absent"));
    }
}
