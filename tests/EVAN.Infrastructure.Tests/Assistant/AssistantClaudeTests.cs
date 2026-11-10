using System.Text;
using System.Text.Json.Nodes;
using Anthropic;
using EVAN.Application.Assistant;
using EVAN.Infrastructure.Assistant;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EVAN.Infrastructure.Tests.Assistant;

/// <summary>
/// Le pipeline réel de l'assistant (SDK d'Anthropic, adaptateur IChatClient, exécution des outils, point de cache) face
/// à un faux serveur Anthropic : on lit les requêtes telles qu'elles partiraient (cache, effort, repli, ordre des
/// outils, prompt stable) et l'on fait répondre des flux SSE au décompte de jetons connu.
/// </summary>
public class AssistantClaudeTests
{
    private const long Jeudi = 1791448200000; // jeu. 8 oct. 2026, 10 h 30 à Paris
    private const long Vendredi = Jeudi + 24 * 3_600_000L + 17 * 60_000L;

    /// <summary>Faux serveur : rend les flux préparés dans l'ordre et garde chaque requête (corps JSON, en-têtes beta).</summary>
    private sealed class FauxAnthropic(params string[] flux) : HttpMessageHandler
    {
        private readonly Queue<string> _flux = new(flux);
        public readonly List<JsonNode> Requetes = new();
        public readonly List<string> Betas = new();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requetes.Add(JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!);
            Betas.Add(request.Headers.TryGetValues("anthropic-beta", out var b) ? string.Join(",", b) : "");
            return new HttpResponseMessage { Content = new StringContent(_flux.Dequeue(), Encoding.UTF8, "text/event-stream") };
        }
    }

    // Flux SSE de l'API Messages ; les champs variables sont remplacés dans ces modèles (le JSON est plein d'accolades).
    private const string Debut = """
        event: message_start
        data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","model":"claude-opus-5-5","content":[],"stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":ENTREE,"cache_creation_input_tokens":ECRITURE,"cache_read_input_tokens":LECTURE,"output_tokens":1}}}

        event: content_block_start
        data: {"type":"content_block_start","index":0,"content_block":BLOC}

        event: content_block_delta
        data: {"type":"content_block_delta","index":0,"delta":DELTA}

        event: content_block_stop
        data: {"type":"content_block_stop","index":0}

        event: message_delta
        data: {"type":"message_delta","delta":{"stop_reason":"ARRET","stop_sequence":null},"usage":{"output_tokens":SORTIE}}

        event: message_stop
        data: {"type":"message_stop"}


        """;

    private static string Flux(string bloc, string delta, string arret, long entree, long ecriture, long lecture, long sortie) => Debut
        .Replace("BLOC", bloc).Replace("DELTA", delta).Replace("ARRET", arret)
        .Replace("ENTREE", $"{entree}").Replace("ECRITURE", $"{ecriture}").Replace("LECTURE", $"{lecture}").Replace("SORTIE", $"{sortie}");

    /// <summary>Réponse texte, avec son décompte : entrée plein tarif, écriture et lecture du cache, sortie.</summary>
    private static string Texte(string texte, long entree, long ecriture, long lecture, long sortie) =>
        Flux("""{"type":"text","text":""}""", """{"type":"text_delta","text":"TEXTE"}""".Replace("TEXTE", texte), "end_turn", entree, ecriture, lecture, sortie);

    /// <summary>Demande d'outil (sans argument), avec son décompte.</summary>
    private static string Outil(string nom, long entree, long ecriture, long lecture, long sortie) =>
        Flux("""{"type":"tool_use","id":"toolu_test","name":"NOM","input":{}}""".Replace("NOM", nom), """{"type":"input_json_delta","partial_json":"{}"}""", "tool_use", entree, ecriture, lecture, sortie);

    private sealed class Journal : ILogger<AssistantService>
    {
        public readonly List<string> Lignes = new();
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Lignes.Add(formatter(state, exception));
    }

    private static IConfiguration Config(Dictionary<string, string?>? reglages = null) =>
        new ConfigurationBuilder().AddInMemoryCollection(reglages ?? []).Build();

    private static (AssistantService Assistant, FauxAnthropic Serveur, Journal Journal) Creer(IConfiguration config, params string[] flux)
    {
        var serveur = new FauxAnthropic(flux);
        var anthropic = new AnthropicClient { ApiKey = "cle-de-test", HttpClient = new HttpClient(serveur) { BaseAddress = new Uri("http://localhost") } };
        var reglages = AssistantRegistration.Lire(config);
        var journal = new Journal();
        var usine = new UsineFigee(Jeudi);
        var assistant = new AssistantService(
            usine.Outils, UsineFigee.Data,
            AssistantRegistration.CreerClient(anthropic, reglages),
            new AssistantOptions(reglages.Modele, reglages.EffortTexte, reglages.Tarif),
            journal);
        return (assistant, serveur, journal);
    }

    private static async Task<List<EvenementAssistant>> Demander(AssistantService assistant, string? usine, string question, long maintenant)
    {
        var evenements = new List<EvenementAssistant>();
        await foreach (var e in assistant.RepondreAsync(usine, [new MessageAssistant("user", question)], maintenant)) evenements.Add(e);
        return evenements;
    }

    private static int PointsDeCache(JsonNode? n) => n switch
    {
        JsonObject o => (o.ContainsKey("cache_control") ? 1 : 0) + o.Sum(p => PointsDeCache(p.Value)),
        JsonArray a => a.Sum(PointsDeCache),
        _ => 0,
    };

    [Fact]
    public async Task Outils_et_consignes_sont_identiques_d_une_question_a_l_autre_et_portent_le_point_de_cache()
    {
        var (assistant, serveur, _) = Creer(Config(), Texte("Bonjour.", 10, 3000, 0, 5), Texte("Bonjour.", 10, 0, 3000, 5));

        await Demander(assistant, "site-tours", "Quelles pannes ce matin ?", Jeudi);
        await Demander(assistant, "site-crissey", "Et à Crissey ?", Vendredi);

        var (q1, q2) = (serveur.Requetes[0], serveur.Requetes[1]);
        // Préfixe lu dans l'ordre outils, système, messages : outils et premier bloc système à l'octet près.
        Assert.Equal(q1["tools"]!.ToJsonString(), q2["tools"]!.ToJsonString());
        Assert.Equal(q1["system"]![0]!.ToJsonString(), q2["system"]![0]!.ToJsonString());
        Assert.Equal(EvanTools.Methodes.Select(m => m.Outil.Nom), q1["tools"]!.AsArray().Select(t => (string)t!["name"]!));
        // Point de cache à la fin des consignes stables, point automatique en tête de la requête.
        Assert.Equal("ephemeral", (string)q1["system"]![0]!["cache_control"]!["type"]!);
        Assert.Equal("ephemeral", (string)q1["cache_control"]!["type"]!);
        Assert.Equal(2, PointsDeCache(q1));
        // Heure et usine regardée après le point de cache, et nulle part avant.
        var consignes = (string)q1["system"]![0]!["text"]!;
        var contexte = (string)q1["system"]![1]!["text"]!;
        Assert.DoesNotContain("10:30", consignes);
        Assert.Contains("jeu. 8 oct. 10:30", contexte);
        Assert.Contains("(identifiant site-tours)", contexte);
        Assert.Contains("(identifiant site-crissey)", (string)q2["system"]![1]!["text"]!);
        Assert.Null(q1["system"]![1]!["cache_control"]);
    }

    [Fact]
    public async Task Une_boucle_d_outils_garde_deux_points_de_cache_et_additionne_les_jetons_de_chaque_aller_retour()
    {
        var (assistant, serveur, journal) = Creer(Config(),
            Outil("organisation", entree: 120, ecriture: 3100, lecture: 0, sortie: 40),
            Texte("Deux usines.", entree: 15, ecriture: 900, lecture: 3220, sortie: 60));

        var evenements = await Demander(assistant, "site-tours", "Quelles usines ?", Jeudi);

        Assert.Equal(2, serveur.Requetes.Count);
        // Le second aller-retour renvoie l'appel et le résultat de l'outil, mais pas un point de cache de plus.
        Assert.Equal(2, PointsDeCache(serveur.Requetes[1]));
        Assert.Contains("tool_result", serveur.Requetes[1]["messages"]!.ToJsonString());

        var bilan = Assert.Single(evenements, e => e.Type == "bilan").Bilan!;
        Assert.Equal(new ConsommationAssistant(Entree: 135, Sortie: 100, EcritureCache: 4000, LectureCache: 3220, AllersRetours: 2), bilan.Consommation);
        // Prix de Claude Opus 5.5 par million de jetons : 4 $ en entrée, 20 $ en sortie, 0,20 $ en lecture, 5 $ en écriture.
        Assert.Equal((135 * 4m + 100 * 20m + 3220 * 0.20m + 4000 * 5m) / 1_000_000m, bilan.CoutDollars);
        Assert.Equal("claude-opus-5-5", bilan.Modele);
        Assert.Null(bilan.Effort);

        var ligne = Assert.Single(journal.Lignes);
        Assert.Contains("complète", ligne);
        Assert.Contains("allers-retours 2,", ligne);
        Assert.Contains("écrits en cache 4000", ligne);
        Assert.Contains("lus en cache 3220", ligne);
        Assert.Contains("coût estimé 0.0232 $", ligne);
    }

    [Fact]
    public async Task Sans_reglage_le_modele_garde_son_effort_et_le_repli_sur_refus_est_pose()
    {
        var (assistant, serveur, _) = Creer(Config(), Texte("Oui.", 10, 0, 0, 5));
        await Demander(assistant, null, "Ça tourne ?", Jeudi);

        var requete = serveur.Requetes[0];
        Assert.Null(requete["output_config"]);
        Assert.Equal("default", (string)requete["fallbacks"]!);
        Assert.Contains("server-side-fallback-2026-07-01", serveur.Betas[0]);
        Assert.Equal("ephemeral", (string)requete["cache_control"]!["type"]!);
    }

    [Fact]
    public async Task L_effort_se_regle_et_le_cache_reste_pose_sans_repli()
    {
        var config = Config(new() { ["Evan:Assistant:Effort"] = "low", ["Evan:Assistant:RepliSurRefus"] = "false", ["Evan:Assistant:Modele"] = "claude-sonnet-5-5" });
        var (assistant, serveur, _) = Creer(config, Texte("Oui.", 10, 0, 0, 5));
        var bilan = (await Demander(assistant, null, "Ça tourne ?", Jeudi)).Single(e => e.Type == "bilan").Bilan!;

        var requete = serveur.Requetes[0];
        Assert.Equal("claude-sonnet-5-5", (string)requete["model"]!);
        Assert.Equal("low", (string)requete["output_config"]!["effort"]!);
        Assert.Null(requete["fallbacks"]);
        Assert.DoesNotContain("server-side-fallback", serveur.Betas[0]);
        Assert.Equal(2, PointsDeCache(requete));
        Assert.Equal("low", bilan.Effort);
    }

    [Theory]
    [InlineData("moyen")]
    [InlineData("none")]
    public void Un_effort_inconnu_arrete_le_demarrage(string effort)
    {
        var erreur = Assert.Throws<InvalidOperationException>(() => AssistantRegistration.Lire(Config(new() { ["Evan:Assistant:Effort"] = effort })));
        Assert.Contains("low, medium, high, xhigh ou max", erreur.Message);
    }

    [Fact]
    public void Les_prix_par_defaut_couvrent_les_deux_modeles_et_la_configuration_les_complete()
    {
        Assert.Equal(new TarifModele(4m, 20m, 0.20m, 5m), AssistantRegistration.Lire(Config()).Tarif);
        Assert.Equal(new TarifModele(2m, 10m, 0.20m, 2.5m), AssistantRegistration.Lire(Config(new() { ["Evan:Assistant:Modele"] = "claude-sonnet-5-5" })).Tarif);
        // Modèle sans prix connu : aucun coût plutôt qu'un coût inventé.
        Assert.Null(AssistantRegistration.Lire(Config(new() { ["Evan:Assistant:Modele"] = "claude-haiku-5-5" })).Tarif);

        var config = Config(new()
        {
            ["Evan:Assistant:Modele"] = "claude-haiku-5-5",
            ["Evan:Assistant:Prix:claude-haiku-5-5:Entree"] = "0.10",
            ["Evan:Assistant:Prix:claude-haiku-5-5:Sortie"] = "0.50",
            ["Evan:Assistant:Prix:claude-haiku-5-5:LectureCache"] = "0.01",
            ["Evan:Assistant:Prix:claude-opus-5-5:Sortie"] = "25",
        });
        Assert.Equal(new TarifModele(0.10m, 0.50m, 0.01m, 0.125m), AssistantRegistration.Lire(config).Tarif);
        Assert.Equal(new TarifModele(4m, 25m, 0.20m, 5m), AssistantRegistration.LireTarifs(config.GetSection("Evan:Assistant:Prix"))["claude-opus-5-5"]);

        var incomplet = Config(new() { ["Evan:Assistant:Prix:autre-modele:Entree"] = "1" });
        Assert.Contains("autre-modele:Sortie", Assert.Throws<InvalidOperationException>(() => AssistantRegistration.Lire(incomplet)).Message);
    }
}
