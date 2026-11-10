using EVAN.Application.Connections;
using EVAN.Application.Live;

namespace EVAN.Api.Endpoints;

/// <summary>
/// Test de liaison d'une machine, relayé à la passerelle de son usine. La passerelle n'est jamais choisie par le client :
/// c'est celle de l'usine visée, et une autre est refusée. Ce que la passerelle accepte de joindre, elle le décide seule
/// (Gateway:AllowedTestTargets) ; ici, la requête est seulement bornée.
/// </summary>
internal static class ConnectionEndpoints
{
    public sealed record TestRequest(string MachineId, string Protocole, Dictionary<string, string>? Parametres, string? SiteId, string? GatewayId);

    public static RouteGroupBuilder MapConnectionEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/connections/test", async (TestRequest req, LiveService live, ConnectionTestService tests, IConfiguration config, CancellationToken ct) =>
        {
            if (Bornes.TestLiaison(req) is { } erreur) return Results.Problem(erreur, statusCode: StatusCodes.Status400BadRequest);
            var siteId = req.SiteId ?? live.SiteIds.FirstOrDefault();
            if (siteId is null || live.Site(siteId) is not { } usine) return Results.Problem("Usine inconnue.", statusCode: StatusCodes.Status404NotFound);
            // Chaque usine a sa passerelle : celle du site, sinon la passerelle par défaut de la configuration.
            var gateway = usine.Site.Passerelle ?? config["Evan:GatewayId"] ?? "tours-01";
            if (req.GatewayId is not null && req.GatewayId != gateway)
                return Results.Problem("Cette passerelle n'est pas celle de l'usine visée.", statusCode: StatusCodes.Status400BadRequest);
            if (live.MachineDUneAutreUsine(siteId, req.MachineId))
                return Results.Problem("Cette machine appartient à une autre usine.", statusCode: StatusCodes.Status400BadRequest);
            return Results.Ok(await tests.TestAsync(siteId, gateway, req.MachineId, req.Protocole, req.Parametres ?? new(), ct));
        });
        return api;
    }
}
