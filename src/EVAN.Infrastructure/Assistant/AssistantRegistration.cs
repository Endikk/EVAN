using Anthropic;
using Anthropic.Models.Beta.Messages;
using EVAN.Application.Assistant;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace EVAN.Infrastructure.Assistant;

/// <summary>Réglages lus dans Evan:Assistant : modèle, effort (null : celui du modèle), repli sur refus, prix du modèle.</summary>
internal sealed record ReglagesAssistant(string Modele, Effort? Effort, bool RepliSurRefus, TarifModele? Tarif)
{
    /// <summary>Effort tel que l'API l'écrit (low, medium, high, xhigh, max), null pour celui du modèle.</summary>
    public string? EffortTexte => Effort?.ToString().ToLowerInvariant();
}

/// <summary>
/// Branche le modèle de l'assistant : Claude, par le SDK officiel d'Anthropic et son adaptateur IChatClient, avec
/// l'exécution des outils d'EVAN (FunctionInvokingChatClient). La clé reste côté serveur : ANTHROPIC_API_KEY ou
/// Evan:Assistant:CleApi. Sans clé, l'assistant est simplement indisponible ; le serveur MCP fonctionne sans elle.
/// Evan:Assistant:UrlApi permet de passer par une passerelle d'entreprise (ou un faux serveur pour les tests).
/// </summary>
public static class AssistantRegistration
{
    public const string ModeleParDefaut = "claude-opus-5-5";
    private const int JetonsMax = 8000;
    /// <summary>Quelques allers-retours d'outils suffisent à une question d'atelier ; la borne évite une boucle coûteuse.</summary>
    private const int AllersRetoursMax = 8;
    private const string BetaRepli = "server-side-fallback-2026-07-01";

    /// <summary>
    /// Prix publiés par Anthropic, en dollars par million de jetons : entrée, sortie, lecture du cache. L'écriture d'un
    /// cache de 5 minutes coûte 1,25 fois l'entrée. Evan:Assistant:Prix les remplace ou ajoute d'autres modèles.
    /// </summary>
    public static IReadOnlyDictionary<string, TarifModele> TarifsParDefaut { get; } = new Dictionary<string, TarifModele>
    {
        ["claude-opus-5-5"] = new(Entree: 4m, Sortie: 20m, LectureCache: 0.20m, EcritureCache: 5m),
        ["claude-sonnet-5-5"] = new(Entree: 2m, Sortie: 10m, LectureCache: 0.20m, EcritureCache: 2.5m),
    };

    private const decimal EcritureParEntree = 1.25m;

    public static IServiceCollection AddEvanAssistant(this IServiceCollection services, IConfiguration config)
    {
        var reglages = Lire(config);
        services.AddSingleton(new AssistantOptions(reglages.Modele, reglages.EffortTexte, reglages.Tarif));
        var cle = config["Evan:Assistant:CleApi"] ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
        if (string.IsNullOrWhiteSpace(cle)) return services;

        services.AddSingleton<IChatClient>(sp =>
        {
            var anthropic = config["Evan:Assistant:UrlApi"] is { Length: > 0 } url
                ? new AnthropicClient { ApiKey = cle, BaseUrl = url }
                : new AnthropicClient { ApiKey = cle };
            return CreerClient(anthropic, reglages, sp);
        });
        return services;
    }

    /// <summary>
    /// Pipeline de l'assistant : paramètres de base de chaque appel, exécution des outils, point de cache sur la partie
    /// stable du prompt, adaptateur IChatClient du SDK.
    /// </summary>
    internal static IChatClient CreerClient(AnthropicClient anthropic, ReglagesAssistant reglages, IServiceProvider? services = null) =>
        new ChatClientBuilder(anthropic.Beta.AsIChatClient(reglages.Modele, JetonsMax))
            .ConfigureOptions(o => o.RawRepresentationFactory ??= _ => Parametres(reglages))
            .UseFunctionInvocation(configure: f => f.MaximumIterationsPerRequest = AllersRetoursMax)
            .Use(inner => new PointDeCacheChatClient(inner))
            .Build(services);

    /// <summary>
    /// Paramètres de base de chaque appel au modèle, que l'adaptateur IChatClient complète : il ajoute les messages à la
    /// suite, place ses blocs système après ceux d'ici (aucun) et ses outils après ceux d'ici (aucun), et ne touche ni au
    /// cache, ni à l'effort, ni au repli. Le cache_control posé en tête met en cache automatiquement le dernier bloc de
    /// chaque requête : les allers-retours d'une même question relisent tout ce qui précède. Il compte pour un des quatre
    /// points de cache permis ; le point des consignes (<see cref="PointDeCacheChatClient"/>) en est un deuxième.
    /// </summary>
    internal static MessageCreateParams Parametres(ReglagesAssistant reglages)
    {
        var p = new MessageCreateParams
        {
            Model = reglages.Modele,
            MaxTokens = JetonsMax,
            Messages = [],
            CacheControl = new BetaCacheControlEphemeral(),
        };
        // Sans réglage, aucun effort n'est envoyé : le modèle garde le sien (medium pour Claude Opus 5.5).
        if (reglages.Effort is { } effort) p = p with { OutputConfig = new BetaOutputConfig { Effort = effort } };
        // Repli côté serveur si le modèle décline une demande (catégories de refus) : un autre modèle reprend la réponse.
        if (reglages.RepliSurRefus) p = p with { Betas = [BetaRepli], Fallbacks = new Default() };
        return p;
    }

    internal static ReglagesAssistant Lire(IConfiguration config)
    {
        var modele = config["Evan:Assistant:Modele"] is { Length: > 0 } m ? m : ModeleParDefaut;
        return new ReglagesAssistant(
            modele,
            LireEffort(config["Evan:Assistant:Effort"]),
            config.GetValue("Evan:Assistant:RepliSurRefus", true),
            LireTarifs(config.GetSection("Evan:Assistant:Prix")).GetValueOrDefault(modele));
    }

    /// <summary>Effort demandé au modèle ; vide pour garder celui du modèle. Une valeur inconnue arrête le démarrage.</summary>
    internal static Effort? LireEffort(string? valeur) => valeur?.Trim().ToLowerInvariant() switch
    {
        null or "" => null,
        "low" => Effort.Low,
        "medium" => Effort.Medium,
        "high" => Effort.High,
        "xhigh" => Effort.Xhigh,
        "max" => Effort.Max,
        _ => throw new InvalidOperationException($"Evan:Assistant:Effort « {valeur} » inconnu : low, medium, high, xhigh ou max (vide : celui du modèle)."),
    };

    /// <summary>
    /// Prix par modèle : ceux par défaut, complétés ou remplacés par Evan:Assistant:Prix:{modèle}:{Entree, Sortie,
    /// LectureCache, EcritureCache}. Un modèle nouveau doit donner au moins Entree, Sortie et LectureCache ; l'écriture
    /// vaut 1,25 fois l'entrée si elle n'est pas précisée.
    /// </summary>
    internal static Dictionary<string, TarifModele> LireTarifs(IConfigurationSection section)
    {
        var tarifs = new Dictionary<string, TarifModele>(TarifsParDefaut, StringComparer.Ordinal);
        foreach (var modele in section.GetChildren())
        {
            var connu = tarifs.GetValueOrDefault(modele.Key);
            decimal Prix(string cle, decimal? defaut) =>
                modele.GetValue<decimal?>(cle) ?? defaut
                ?? throw new InvalidOperationException($"Evan:Assistant:Prix:{modele.Key}:{cle} manquant : prix en dollars par million de jetons.");
            var entree = Prix("Entree", connu?.Entree);
            // Écriture non précisée : celle du modèle connu si son entrée ne change pas, sinon 1,25 fois la nouvelle entrée.
            var ecriture = modele["Entree"] is null && connu is not null ? connu.EcritureCache : entree * EcritureParEntree;
            tarifs[modele.Key] = new TarifModele(entree, Prix("Sortie", connu?.Sortie), Prix("LectureCache", connu?.LectureCache), Prix("EcritureCache", ecriture));
        }
        return tarifs;
    }
}
