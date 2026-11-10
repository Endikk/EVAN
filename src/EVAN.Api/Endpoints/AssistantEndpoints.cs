using EVAN.Api.Securite;
using EVAN.Application.Assistant;
using EVAN.Application.Live;

namespace EVAN.Api.Endpoints;

/// <summary>
/// « Demander à EVAN » : disponibilité de l'assistant, et réponse en flux SSE (appels d'outils, texte, fin). Le front
/// n'a jamais la clé : il parle à ce point d'accès, qui parle à Claude. La question passe d'abord par la garde
/// (<see cref="GardeIa"/> : accès, débit, coût), puis par la validation de la conversation, avant tout appel au modèle.
/// </summary>
internal static class AssistantEndpoints
{
    public sealed record QuestionRequest(string? SiteId, List<MessageAssistant> Messages);

    public static RouteGroupBuilder MapAssistantEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/assistant", (AssistantService assistant, GardeIa garde, HttpContext http) =>
        {
            var acces = garde.Acces(http);
            var disponible = assistant.Disponible && acces != AccesIa.Ferme;
            return Results.Ok(new
            {
                disponible,
                modele = assistant.Modele,
                mcp = EVAN.Mcp.DependencyInjection.Route,
                // « local » : poste du serveur ; « code » : un code d'accès est demandé ; « ferme » : pas de code configuré, réseau refusé.
                acces = acces.ToString().ToLowerInvariant(),
                caracteresMax = AssistantService.CaracteresParMessage,
                raison = !assistant.Disponible
                    ? "Aucune clé d'API Claude sur le serveur : définir ANTHROPIC_API_KEY (ou Evan:Assistant:CleApi) puis relancer EVAN.Api."
                    : acces == AccesIa.Ferme
                        ? "L'assistant ne sert que le poste du serveur : définir un code d'accès (Evan:Assistant:CodeAcces) pour l'ouvrir au réseau."
                        : null,
            });
        });

        api.MapPost("/assistant", async (QuestionRequest req, AssistantService assistant, GardeIa garde, HttpContext http, ILoggerFactory logs, CancellationToken ct) =>
        {
            if (!assistant.Disponible) return Results.Problem("Assistant non configuré sur le back.", statusCode: StatusCodes.Status503ServiceUnavailable);
            if (AssistantService.Refus(req.Messages) is { } refus) return Results.BadRequest(new { erreur = refus });
            http.Response.Headers.ContentType = "text/event-stream";
            http.Response.Headers.CacheControl = "no-cache";
            // nginx : ne pas mettre le flux en tampon.
            http.Response.Headers["X-Accel-Buffering"] = "no";
            // Réponse bornée dans le temps : le navigateur qui part l'interrompt, une boucle d'outils trop longue aussi.
            using var delai = CancellationTokenSource.CreateLinkedTokenSource(ct);
            delai.CancelAfter(garde.DureeMax);
            async Task Envoyer(EvenementAssistant e)
            {
                await http.Response.WriteAsync(AssistantService.Sse(e), ct);
                await http.Response.Body.FlushAsync(ct);
            }
            try
            {
                // Le bilan (jetons, coût) est journalisé par l'assistant ; il ne part pas au navigateur.
                await foreach (var e in assistant.RepondreAsync(req.SiteId, req.Messages, Clock.Now(), delai.Token))
                    if (e.Type != "bilan") await Envoyer(e);
                await Envoyer(new EvenementAssistant("fin"));
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // Le navigateur a interrompu la réponse.
            }
            catch (OperationCanceledException) when (delai.IsCancellationRequested)
            {
                await Envoyer(new EvenementAssistant("erreur", "La réponse a pris trop de temps : reformulez la question, plus précise."));
            }
            catch (Exception ex)
            {
                logs.CreateLogger("EVAN.Assistant").LogWarning(ex, "Réponse de l'assistant interrompue");
                await Envoyer(new EvenementAssistant("erreur", "L'assistant n'a pas pu répondre (modèle injoignable ou clé refusée). Réessayez dans un instant."));
            }
            return Results.Empty;
        }).ProtegerIa(UsageIa.Assistant);
        return api;
    }
}
