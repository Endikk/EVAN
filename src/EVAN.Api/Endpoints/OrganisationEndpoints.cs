using EVAN.Api.Securite;
using EVAN.Application.Comptes;
using EVAN.Application.Live;

namespace EVAN.Api.Endpoints;

/// <summary>
/// L'organisation de l'utilisateur et ses usines (celle de la démo sans compte), et ses comptes : un administrateur
/// les liste et crée les membres. Aucune route ne donne accès à une autre organisation que celle de la session.
/// </summary>
internal static class OrganisationEndpoints
{
    public sealed record CompteRequest(string? Identifiant, string? Nom, string? MotDePasse, string? Role);

    /// <summary>Ce qu'on montre d'un compte : jamais son empreinte.</summary>
    private static object Vue(Compte c) => new { id = c.Id, identifiant = c.Identifiant, nom = c.Nom, role = c.Role, creeLe = c.CreeLe };

    public static RouteGroupBuilder MapOrganisationEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/organisation", async (HttpContext http, AccesUsines acces, LiveService live, ComptesService comptes, CancellationToken ct) =>
        {
            var usines = acces.DeSonOrganisation(http.User).Select(u => u.Usine.Site).ToList();
            if (http.User.OrganisationId() is { } id)
            {
                var organisation = await comptes.OrganisationAsync(id, ct);
                return organisation is null ? Results.NotFound() : Results.Ok(new { organisation, sites = usines });
            }
            return acces.DemoOuverte
                ? Results.Ok(new { organisation = live.Organisation, sites = usines })
                : Results.Json(new { erreur = "Connexion requise." }, statusCode: StatusCodes.Status401Unauthorized);
        });

        var membres = api.MapGroup("/organisation/membres").RequireAuthorization(Politiques.Admin);
        membres.MapGet("", async (HttpContext http, ComptesService comptes, CancellationToken ct) =>
            Results.Ok((await comptes.ComptesAsync(http.User.OrganisationId()!, ct)).Select(Vue)));

        membres.MapPost("", async (CompteRequest req, HttpContext http, ComptesService comptes, ILoggerFactory logs, CancellationToken ct) =>
        {
            var r = await comptes.CreerCompteAsync(http.User.OrganisationId()!, new NouveauCompte(req.Identifiant, req.Nom, req.MotDePasse, req.Role), ct);
            if (!r.Reussi)
                return SessionEndpoints.Champs(r.Conflit ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest, "Compte non créé : corrigez les champs signalés.", r.Erreurs);
            logs.CreateLogger("EVAN.Session").LogInformation("Compte {Compte} ({Role}) créé dans {Organisation}", r.Compte!.Id, r.Compte.Role, r.Compte.OrganisationId);
            return Results.Json(Vue(r.Compte), statusCode: StatusCodes.Status201Created);
        });
        return api;
    }
}
