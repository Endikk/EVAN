using System.Runtime.CompilerServices;
using System.Text.Json;
using EVAN.Application.Exploitation;
using EVAN.Core.Domain.Catalog;
using Microsoft.Extensions.AI;
using Microsoft.Extensions.Logging;

namespace EVAN.Application.Assistant;

/// <summary>Message de la conversation, tel que l'envoie le front.</summary>
public sealed record MessageAssistant(string Role, string Texte);

/// <summary>
/// Ce que l'assistant renvoie au fil de sa réponse : un appel d'outil, un morceau de texte, puis le bilan de la question
/// (jetons et coût, pour le journal du serveur et l'évaluation ; le navigateur ne le reçoit pas).
/// </summary>
public sealed record EvenementAssistant(string Type, string? Texte = null, string? Outil = null, IDictionary<string, object?>? Arguments = null, BilanQuestion? Bilan = null);

/// <summary>
/// Réglages de l'assistant vus des cas d'usage : modèle (Evan:Assistant:Modele), effort demandé (Evan:Assistant:Effort,
/// null pour celui du modèle) et prix du modèle (Evan:Assistant:Prix, null s'il n'est pas connu).
/// </summary>
public sealed record AssistantOptions(string Modele, string? Effort = null, TarifModele? Tarif = null);

/// <summary>
/// « Demander à EVAN » : une question en langage naturel, la réponse de Claude appuyée sur les outils d'EVAN (les mêmes
/// que ceux du serveur MCP). Le client de modèle est un port (<see cref="IChatClient"/>) branché par l'infrastructure
/// quand une clé d'API est configurée ; la clé ne quitte jamais le serveur.
/// Le prompt commence par une partie stable d'une question à l'autre (outils, puis <see cref="Consignes"/>), que le
/// client de modèle peut mettre en cache, et finit par ce qui change (<see cref="Contexte"/>, conversation).
/// </summary>
public sealed class AssistantService(EvanTools tools, ReferenceData data, IChatClient? client = null, AssistantOptions? options = null, ILogger<AssistantService>? journal = null)
{
    /// <summary>Bornes d'une conversation : assez pour une question d'atelier et son contexte, pas pour faire lire un roman au modèle.</summary>
    public const int MessagesMax = 20;
    public const int CaracteresParMessage = 4000;
    public const int CaracteresMax = 24000;

    /// <summary>
    /// Propriété qui marque le contenu fermant la partie stable du prompt (outils et consignes, identiques d'une question à
    /// l'autre). Un client de modèle qui sait mettre en cache y pose un point de cache ; les autres l'ignorent.
    /// </summary>
    public const string FinDuPrefixeStable = "evan:fin_prefixe_stable";

    public bool Disponible => client is not null;

    public string? Modele => client is null ? null : options?.Modele;

    /// <summary>
    /// Consignes système stables : rôle, usines de l'organisation, règles de citation et de prudence. Rien qui change
    /// d'une question à l'autre (ni heure, ni usine regardée) : le modèle les relit dans le cache de prompt.
    /// </summary>
    public string Consignes()
    {
        var usines = string.Join(", ", data.Demo.Usines.Select(u => $"{u.Site.Nom} ({u.Site.Id})"));
        return $"""
            Tu es EVAN, l'assistant de supervision d'usine de l'organisation « {data.Demo.Organisation.Nom} ». Tu réponds aux équipes de production et de maintenance, en français, de façon brève et factuelle.
            Usines de l'organisation : {usines}. L'usine que l'utilisateur regarde, la date et l'heure sont données à la fin des consignes.

            Règles :
            - Appuie chaque réponse sur les outils (alarmes, arrêts et TRS, chronologie d'une panne, carnet de maintenance et interventions planifiées, énergie, état en direct, diagnostic d'un défaut répétitif, courbe d'une mesure). N'invente aucune valeur ; si une donnée manque, dis-le.
            - Sans précision, la question porte sur l'usine que l'utilisateur regarde : passe son identifiant aux outils.
            - Cite les machines et les alarmes sous forme de liens, avec les identifiants renvoyés par les outils : [R01](machine:m-r01), [EM-01](alarme:h-m-r01-1791443880). L'application les rend cliquables.
            - Donne les heures en heure locale (« mer. 7 oct. à 14 h 49 ») et les durées en minutes ou en heures.
            - Quand c'est utile, termine par l'action recommandée : intervention, maintenance à planifier, réglage, vérification.
            - Réponds en quelques phrases ou en une courte liste ; pas de tableau large.
            """;
    }

    /// <summary>
    /// Ce qui change à chaque question, placé après le point de cache : l'usine regardée (la première de l'organisation si
    /// elle est inconnue, par exemple créée dans le navigateur) et l'heure de Paris.
    /// </summary>
    public string Contexte(string? siteId, long maintenant)
    {
        var usine = data.Demo.Usine(siteId ?? "") ?? data.Demo.Usines.First();
        return $"""
            Usine que l'utilisateur regarde : {usine.Site.Nom} (identifiant {usine.Site.Id}).
            Date et heure actuelles : {ExploitationService.Libelle(maintenant)} (heure de Paris).
            """;
    }

    /// <summary>
    /// Motif de refus d'une conversation mal formée, null si elle est recevable. Vérifié avant tout appel au modèle :
    /// une requête refusée ne coûte rien. Une usine inconnue n'est pas un refus (usine créée dans le navigateur) :
    /// les consignes retombent sur la première usine de l'organisation.
    /// </summary>
    public static string? Refus(IReadOnlyList<MessageAssistant>? messages)
    {
        if (messages is not { Count: > 0 }) return "Question vide.";
        if (messages.Count > MessagesMax) return $"Conversation trop longue : {MessagesMax} messages au plus.";
        if (messages.Any(m => m is null || m.Role is not ("user" or "assistant"))) return "Rôle de message inconnu (user ou assistant).";
        if (messages[^1].Role != "user" || string.IsNullOrWhiteSpace(messages[^1].Texte)) return "Le dernier message doit être la question.";
        if (messages.Any(m => (m.Texte?.Length ?? 0) > CaracteresParMessage)) return $"Message trop long : {CaracteresParMessage} caractères au plus.";
        if (messages.Sum(m => m.Texte?.Length ?? 0) > CaracteresMax) return $"Conversation trop longue : {CaracteresMax} caractères au plus.";
        return null;
    }

    /// <summary>
    /// Réponse en flux : appels d'outils au fur et à mesure, puis le texte, puis le bilan de la question (jetons de
    /// chaque aller-retour additionnés, coût estimé), aussi écrit au journal. Une réponse interrompue est journalisée
    /// avec ce qu'elle a déjà consommé.
    /// </summary>
    public async IAsyncEnumerable<EvenementAssistant> RepondreAsync(string? siteId, IReadOnlyList<MessageAssistant> messages, long maintenant, [EnumeratorCancellation] CancellationToken ct = default)
    {
        if (client is null) throw new InvalidOperationException("Assistant non configuré.");
        if (Refus(messages) is { } refus) throw new ArgumentException(refus, nameof(messages));
        var consignes = new TextContent(Consignes()) { AdditionalProperties = new() { [FinDuPrefixeStable] = true } };
        List<ChatMessage> conversation = [new(ChatRole.System, [consignes]), new(ChatRole.System, Contexte(siteId, maintenant))];
        conversation.AddRange(messages
            .Where(m => !string.IsNullOrWhiteSpace(m.Texte))
            .TakeLast(MessagesMax)
            .Select(m => new ChatMessage(m.Role == "assistant" ? ChatRole.Assistant : ChatRole.User, m.Texte)));
        var chatOptions = new ChatOptions { Tools = [.. tools.Fonctions()], ToolMode = ChatToolMode.Auto, MaxOutputTokens = 8000 };
        var consommation = ConsommationAssistant.Aucune;
        var complete = false;
        BilanQuestion? bilan = null;
        try
        {
            await foreach (var update in client.GetStreamingResponseAsync(conversation, chatOptions, ct))
            {
                foreach (var content in update.Contents)
                {
                    switch (content)
                    {
                        case FunctionCallContent call:
                            yield return new EvenementAssistant("outil", Outil: call.Name, Arguments: call.Arguments);
                            break;
                        case TextContent { Text.Length: > 0 } text:
                            yield return new EvenementAssistant("texte", text.Text);
                            break;
                        // Chaque appel au modèle finit par son décompte de jetons : un par aller-retour.
                        case UsageContent usage:
                            consommation = consommation.Plus(ConsommationAssistant.AllerRetour(usage.Details));
                            break;
                    }
                }
            }
            complete = true;
        }
        finally
        {
            bilan = new BilanQuestion(options?.Modele, options?.Effort, consommation, options?.Tarif?.Cout(consommation));
            Journaliser(bilan, complete);
        }
        yield return new EvenementAssistant("bilan", Bilan: bilan);
    }

    private void Journaliser(BilanQuestion b, bool complete)
    {
        if (journal is null) return;
        var c = b.Consommation;
        var etat = complete ? "complète" : "interrompue";
        var effort = b.Effort ?? "par défaut";
        if (b.CoutDollars is { } cout)
            journal.LogInformation(
                "Réponse de l'assistant {Etat} : modèle {Modele}, effort {Effort}, allers-retours {AllersRetours}, jetons en entrée {Entree}, en sortie {Sortie}, écrits en cache {EcritureCache}, lus en cache {LectureCache}, coût estimé {CoutDollars:0.0000} $",
                etat, b.Modele, effort, c.AllersRetours, c.Entree, c.Sortie, c.EcritureCache, c.LectureCache, cout);
        else
            journal.LogInformation(
                "Réponse de l'assistant {Etat} : modèle {Modele}, effort {Effort}, allers-retours {AllersRetours}, jetons en entrée {Entree}, en sortie {Sortie}, écrits en cache {EcritureCache}, lus en cache {LectureCache}, coût non estimé (aucun prix connu pour ce modèle)",
                etat, b.Modele, effort, c.AllersRetours, c.Entree, c.Sortie, c.EcritureCache, c.LectureCache);
    }

    /// <summary>Événement au format SSE (event + data JSON), tel que le lit le front ; vide pour le bilan.</summary>
    public static string Sse(EvenementAssistant e) => e.Type switch
    {
        "outil" => $"event: outil\ndata: {JsonSerializer.Serialize(new { nom = e.Outil, arguments = e.Arguments ?? new Dictionary<string, object?>() })}\n\n",
        "texte" => $"event: texte\ndata: {JsonSerializer.Serialize(new { delta = e.Texte })}\n\n",
        "erreur" => $"event: erreur\ndata: {JsonSerializer.Serialize(new { message = e.Texte })}\n\n",
        // Le bilan (jetons, coût) reste dans le journal du serveur : rien n'en part vers le navigateur.
        "bilan" => "",
        _ => "event: fin\ndata: {}\n\n",
    };
}
