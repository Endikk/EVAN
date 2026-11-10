using Anthropic.Models.Messages;
using EVAN.Application.Assistant;
using Microsoft.Extensions.AI;

namespace EVAN.Infrastructure.Assistant;

/// <summary>
/// Pose un point de cache de prompt d'Anthropic là où l'assistant a marqué la fin de la partie stable du prompt
/// (<see cref="AssistantService.FinDuPrefixeStable"/>) : outils et consignes sont relus du cache d'une question à l'autre
/// au lieu d'être refacturés au plein tarif. La suite de la conversation (allers-retours d'outils d'une même question)
/// est mise en cache par le point automatique posé en tête des paramètres de l'appel (voir
/// <see cref="AssistantRegistration"/>). Les messages reçus ne sont pas modifiés : le contenu marqué est recopié, sans
/// quoi chaque aller-retour ajouterait un point de cache aux précédents (quatre au plus par requête).
/// </summary>
internal sealed class PointDeCacheChatClient(IChatClient inner) : DelegatingChatClient(inner)
{
    public override Task<ChatResponse> GetResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        base.GetResponseAsync(Marquer(messages), options, cancellationToken);

    public override IAsyncEnumerable<ChatResponseUpdate> GetStreamingResponseAsync(IEnumerable<ChatMessage> messages, ChatOptions? options = null, CancellationToken cancellationToken = default) =>
        base.GetStreamingResponseAsync(Marquer(messages), options, cancellationToken);

    internal static List<ChatMessage> Marquer(IEnumerable<ChatMessage> messages) =>
        messages.Select(m => m.Contents.Any(FermeLePrefixe) ? Recopier(m) : m).ToList();

    private static bool FermeLePrefixe(AIContent c) =>
        c is TextContent && c.AdditionalProperties?.ContainsKey(AssistantService.FinDuPrefixeStable) == true;

    private static ChatMessage Recopier(ChatMessage m)
    {
        var copie = m.Clone();
        copie.Contents = m.Contents
            .Select(c => FermeLePrefixe(c) ? new TextContent(((TextContent)c).Text).WithCacheControl(new CacheControlEphemeral()) : c)
            .ToList();
        return copie;
    }
}
