using EVAN.Api.Securite;
using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Application.Usines;

namespace EVAN.Api.Endpoints;

/// <summary>
/// Usines (sites) : liste, configuration complète (lue et enregistrée), instantané temps réel, historique des alarmes
/// et journal. Le filtre du groupe (<see cref="FiltreAccesUsine"/>) ne laisse passer que les usines que l'utilisateur voit.
/// </summary>
internal static class SiteEndpoints
{
    public sealed record EventRequest(string Type, string Message, string? MachineId, string? Auteur);

    /// <summary>Corps d'une configuration complète : des centaines de machines et de points, bien plus que les 64 ko des autres routes.</summary>
    public const long CorpsConfigurationMax = 4 * 1024 * 1024;

    public static RouteGroupBuilder MapSiteEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/sites", (HttpContext http, AccesUsines acces) => Results.Ok(acces.DeSonOrganisation(http.User).Select(u => u.Usine.Site)));

        api.MapGet("/sites/{siteId}", (string siteId, UsinesService usines) => usines.Configuration(siteId) is { } c ? Results.Ok(c) : Results.NotFound());

        // Enregistrement de la configuration complète par un compte de l'organisation. La route contrôle elle-même
        // l'accès : une usine nouvelle n'est encore à personne, celle d'une autre organisation répond 404.
        api.MapPut("/sites/{siteId}", async (string siteId, ConfigurationUsine config, UsinesService usines, HttpContext http, ILoggerFactory logs, CancellationToken ct) =>
        {
            ResultatUsine r;
            try
            {
                r = await usines.EnregistrerAsync(http.User.OrganisationId()!, siteId, config, ct);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logs.CreateLogger("EVAN.Usines").LogError(ex, "Enregistrement de l'usine {Site} en échec", siteId);
                return Results.Json(new { erreur = "La base n'a pas pu enregistrer l'usine. Rien n'a changé : réessayez dans un instant." }, statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            if (r.Introuvable) return Results.NotFound(new { erreur = "Introuvable." });
            if (r.Configuration is null)
                return SessionEndpoints.Champs(r.Conflit ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest, "Configuration non enregistrée : corrigez les champs signalés.", r.Erreurs);
            logs.CreateLogger("EVAN.Usines").LogInformation("Usine {Site} enregistrée ({Machines} machines)", siteId, r.Configuration.Machines.Count);
            return Results.Ok(r.Configuration);
        })
        .RequireAuthorization(Politiques.Membre)
        .WithMetadata(new AccesVerifieParLaRoute(), new TailleCorps(CorpsConfigurationMax));

        api.MapGet("/sites/{siteId}/live", (string siteId, LiveService live) => live.Snapshot(siteId) is { } snap ? Results.Ok(snap) : Results.NotFound());

        api.MapGet("/sites/{siteId}/alarms", async (string siteId, DateTimeOffset? from, DateTimeOffset? to, string? machineId, IStore store, CancellationToken ct) =>
            Results.Ok(await store.AlarmsAsync(siteId, from ?? DateTimeOffset.UtcNow.AddDays(-7), to ?? DateTimeOffset.UtcNow, machineId, ct)))
            .WithRequestTimeout(EvanApi.TimeoutLecture);

        api.MapGet("/sites/{siteId}/events", async (string siteId, DateTimeOffset? from, IStore store, CancellationToken ct) =>
            Results.Ok(await store.EventsAsync(siteId, from ?? DateTimeOffset.UtcNow.AddDays(-1), ct)))
            .WithRequestTimeout(EvanApi.TimeoutLecture);

        api.MapPost("/sites/{siteId}/events", async (string siteId, EventRequest req, LiveService live, HttpContext http) =>
        {
            if (Bornes.Evenement(req) is { } erreur) return Results.BadRequest(new { erreur });
            // Usine inconnue : rien n'est journalisé, autant le dire. Une machine d'une autre usine n'entre pas dans ce journal.
            if (live.Site(siteId) is null) return Results.NotFound();
            if (live.MachineDUneAutreUsine(siteId, req.MachineId)) return Results.BadRequest(new { erreur = "Machine d'une autre usine." });
            // Connecté, l'événement est signé du compte ; la signature envoyée par le client ne vaut que pour la démo.
            await live.LogEventAsync(siteId, req.Type, req.Message, req.MachineId, http.User.Auteur() ?? req.Auteur);
            return Results.Accepted();
        });
        return api;
    }
}
