using System.Security.Claims;
using EVAN.Api.Securite;
using EVAN.Application.Comptes;
using EVAN.Application.Live;
using Microsoft.AspNetCore.Mvc;

namespace EVAN.Api.Endpoints;

/// <summary>
/// L'organisation de l'utilisateur et ses usines (celle de la démo sans compte), et ses comptes : un administrateur
/// les liste, crée les membres, en retire et leur donne un mot de passe provisoire, et lit le journal de ces actions.
/// Aucune route ne donne accès à une autre organisation que celle de la session : l'organisation vient du cookie,
/// jamais de l'adresse ni du corps.
/// </summary>
internal static class OrganisationEndpoints
{
    public sealed record CompteRequest(string? Identifiant, string? Nom, string? MotDePasse, string? Role);

    /// <summary>Retrait et mot de passe provisoire : le mot de passe de l'administrateur qui agit, redemandé.</summary>
    public sealed record ConfirmationRequest(string? MotDePasse);

    /// <summary>Lignes du journal rendues par la route : les 200 plus récentes.</summary>
    private const int JournalMax = 200;

    /// <summary>Ce qu'on montre d'un compte : jamais son empreinte.</summary>
    private static object Vue(Compte c) => new { id = c.Id, identifiant = c.Identifiant, nom = c.Nom, role = c.Role, creeLe = c.CreeLe };

    /// <summary>Même réponse pour un compte inconnu, hors bornes ou d'une autre organisation : elle ne dit pas s'il existe ailleurs.</summary>
    private static IResult Introuvable() => Results.NotFound(new { erreur = "Compte introuvable dans votre organisation." });

    /// <summary>Action limitée (<see cref="ActionsMembres"/>) : 429 avec le délai, comme la connexion.</summary>
    private static IResult? Limite(HttpContext http, ActionsMembres limite)
    {
        if (limite.Prendre(http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "") is not { } attente) return null;
        return Patienter(http, attente, "Trop d'actions sur les comptes d'affilée : patientez quelques secondes.");
    }

    private static IResult Patienter(HttpContext http, TimeSpan attente, string message)
    {
        http.Response.Headers.RetryAfter = ((int)attente.TotalSeconds).ToString();
        return Results.Json(new { erreur = message }, statusCode: StatusCodes.Status429TooManyRequests);
    }

    /// <summary>
    /// Une session laissée ouverte ou volée ne suffit pas à retirer un compte ni à en prendre la main : le mot de passe
    /// de l'administrateur est redemandé, et ses échecs comptent comme ceux de la connexion (même compteur, même
    /// blocage, bon mot de passe compris). Rend le refus à renvoyer, ou null si l'administrateur est bien lui.
    /// </summary>
    private static async Task<IResult?> Confirmer(HttpContext http, string? motDePasse, ComptesService comptes, EssaisConnexion essais, CancellationToken ct)
    {
        var adresse = EssaisConnexion.Adresse(http);
        var identifiant = http.User.FindFirstValue(ClaimTypes.Email) ?? "";
        if (essais.Connexion(adresse, identifiant) is { } attente)
            return Patienter(http, attente, "Trop d'essais de mot de passe : patientez une minute avant de réessayer.");
        if (await comptes.AuthentifierAsync(identifiant, motDePasse, ct) is { } moi && moi.Id == http.User.FindFirstValue(ClaimTypes.NameIdentifier))
            return null;
        essais.EchecConnexion(adresse, identifiant);
        return SessionEndpoints.Champs(StatusCodes.Status400BadRequest, "Action refusée : votre mot de passe est incorrect.",
            [new("motDePasse", "Votre mot de passe est incorrect.")]);
    }

    private static IResult Refus(IssueMembre issue, string soi) => issue switch
    {
        IssueMembre.Soi => Results.Json(new { erreur = soi }, statusCode: StatusCodes.Status409Conflict),
        IssueMembre.DernierAdministrateur => Results.Json(new { erreur = "C'est le dernier administrateur de l'organisation : créez d'abord un autre compte administrateur." }, statusCode: StatusCodes.Status409Conflict),
        IssueMembre.Refuse => Results.Json(new { erreur = "Réservé aux administrateurs de l'organisation." }, statusCode: StatusCodes.Status403Forbidden),
        _ => Introuvable(),
    };

    /// <summary>Trace au journal des comptes : l'administrateur de la session, sur ce compte, depuis cette adresse.</summary>
    private static Task Journaliser(HttpContext http, ComptesService comptes, Compte cible, string action, CancellationToken ct) =>
        comptes.JournaliserAsync(new EvenementCompte(cible.OrganisationId, http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "",
            http.User.FindFirstValue(ClaimTypes.Email) ?? "", cible.Id, cible.Identifiant, action, EssaisConnexion.Adresse(http), comptes.Maintenant()), ct);

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

        // Journal des actions sur les comptes de l'organisation, le plus récent d'abord. Jamais de mot de passe dedans.
        api.MapGet("/organisation/journal-comptes", async (HttpContext http, ComptesService comptes, CancellationToken ct) =>
            Results.Ok((await comptes.JournalAsync(http.User.OrganisationId()!, JournalMax, ct)).Select(e => new
            {
                action = e.Action,
                auteur = e.AuteurIdentifiant,
                cible = e.CibleIdentifiant,
                adresse = e.Adresse,
                le = e.Le,
            }))).RequireAuthorization(Politiques.Admin);

        var membres = api.MapGroup("/organisation/membres").RequireAuthorization(Politiques.Admin);
        membres.MapGet("", async (HttpContext http, ComptesService comptes, CancellationToken ct) =>
            Results.Ok((await comptes.ComptesAsync(http.User.OrganisationId()!, ct)).Select(Vue)));

        membres.MapPost("", async (CompteRequest req, HttpContext http, ComptesService comptes, ActionsMembres limite, ILoggerFactory logs, CancellationToken ct) =>
        {
            if (Limite(http, limite) is { } attendre) return attendre;
            var r = await comptes.CreerCompteAsync(http.User.OrganisationId()!, new NouveauCompte(req.Identifiant, req.Nom, req.MotDePasse, req.Role), ct);
            if (!r.Reussi)
                return SessionEndpoints.Champs(r.Conflit ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest, "Compte non créé : corrigez les champs signalés.", r.Erreurs);
            await Journaliser(http, comptes, r.Compte!, ActionCompte.Creation, ct);
            logs.CreateLogger("EVAN.Session").LogInformation("Compte {Compte} ({Role}) créé dans {Organisation} par {Auteur}", r.Compte!.Id, r.Compte.Role, r.Compte.OrganisationId, http.User.FindFirstValue(ClaimTypes.NameIdentifier));
            return Results.Json(Vue(r.Compte), statusCode: StatusCodes.Status201Created);
        });

        // Retrait : le compte disparaît, ses sessions tombent à la requête suivante et son temps réel est coupé ici.
        // Les acquittements et interventions qu'il a signés gardent son nom (texte, pas de lien vers le compte).
        membres.MapDelete("/{id}", async (string id, [FromBody] ConfirmationRequest? req, HttpContext http, ComptesService comptes, ActionsMembres limite,
            EssaisConnexion essais, CacheSessions cache, SessionsTempsReel tempsReel, ILoggerFactory logs, CancellationToken ct) =>
        {
            if (Limite(http, limite) is { } attendre) return attendre;
            if (await Confirmer(http, req?.MotDePasse, comptes, essais, ct) is { } refus) return refus;
            if (id.Length > Bornes.Identifiant) return Introuvable();
            var organisation = http.User.OrganisationId()!;
            var auteur = http.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var (issue, cible) = await comptes.RetirerAsync(organisation, auteur, id, ct);
            if (issue != IssueMembre.Fait)
                return Refus(issue, "Vous ne pouvez pas retirer votre propre compte : un autre administrateur de l'organisation peut le faire.");
            cache.Oublier(id);
            tempsReel.Fermer(id);
            if (cible is not null) await Journaliser(http, comptes, cible, ActionCompte.Retrait, ct);
            logs.CreateLogger("EVAN.Session").LogInformation("Compte {Compte} retiré de {Organisation} par {Auteur}", id, organisation, auteur);
            return Results.NoContent();
        });

        // Mot de passe provisoire : tiré par le serveur, rendu une seule fois dans cette réponse (jamais journalisé ni
        // mis en cache), seule son empreinte est gardée. Les sessions ouvertes avec l'ancien tombent ; le titulaire
        // devra le changer à sa connexion, dans les 72 h.
        membres.MapPost("/{id}/mot-de-passe", async (string id, ConfirmationRequest? req, HttpContext http, ComptesService comptes, ActionsMembres limite,
            EssaisConnexion essais, CacheSessions cache, SessionsTempsReel tempsReel, ILoggerFactory logs, CancellationToken ct) =>
        {
            if (Limite(http, limite) is { } attendre) return attendre;
            if (await Confirmer(http, req?.MotDePasse, comptes, essais, ct) is { } refus) return refus;
            if (id.Length > Bornes.Identifiant) return Introuvable();
            var organisation = http.User.OrganisationId()!;
            var auteur = http.User.FindFirstValue(ClaimTypes.NameIdentifier)!;
            var (issue, motDePasse, cible) = await comptes.ReinitialiserAsync(organisation, auteur, id, ct);
            if (issue != IssueMembre.Fait)
                return Refus(issue, "Changez votre propre mot de passe avec « Changer mon mot de passe » : l'actuel y est demandé.");
            cache.Oublier(id);
            tempsReel.Fermer(id);
            if (cible is not null) await Journaliser(http, comptes, cible, ActionCompte.Reinitialisation, ct);
            logs.CreateLogger("EVAN.Session").LogInformation("Mot de passe provisoire donné au compte {Compte} de {Organisation} par {Auteur}", id, organisation, auteur);
            http.Response.Headers.CacheControl = "no-store";
            http.Response.Headers.Pragma = "no-cache";
            return Results.Ok(new { motDePasse });
        });
        return api;
    }
}
