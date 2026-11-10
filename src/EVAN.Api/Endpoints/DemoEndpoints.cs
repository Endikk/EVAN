using EVAN.Application.Live;

namespace EVAN.Api.Endpoints;

/// <summary>Démonstration : panne simulée et remise à zéro (désactivables en production, Evan:DemoEnabled).</summary>
internal static class DemoEndpoints
{
    public sealed record FaultRequest(string? MachineId, int? OrganeNumero);

    public static RouteGroupBuilder MapDemoEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/demo/{siteId}/fault", async (string siteId, FaultRequest? req, LiveService live) =>
        {
            if (live.Site(siteId) is null) return Results.Problem("Usine inconnue.", statusCode: StatusCodes.Status404NotFound);
            return await live.SimulateFaultAsync(siteId, req?.MachineId, req?.OrganeNumero) is { } r
                ? Results.Ok(r)
                : Results.Problem("Aucune machine disponible, ou simulateur / broker injoignable.", statusCode: 409);
        });

        api.MapPost("/demo/{siteId}/reset", async (string siteId, LiveService live) =>
        {
            // Usine inconnue : rien n'est remis à zéro, autant le dire au lieu de répondre « accepté ».
            if (live.Site(siteId) is null) return Results.Problem("Usine inconnue.", statusCode: StatusCodes.Status404NotFound);
            await live.ResetAsync(siteId);
            return Results.Accepted();
        });
        return api;
    }
}
