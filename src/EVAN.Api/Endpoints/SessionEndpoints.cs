using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using EVAN.Api.Securite;
using EVAN.Application.Comptes;
using EVAN.Application.Validation;

namespace EVAN.Api.Endpoints;

/// <summary>
/// Session (connexion, déconnexion, qui est connecté) et installation. Pas d'inscription publique : la première
/// organisation et son administrateur se créent par POST /api/installation, avec le code Evan:CodeInstallation.
/// </summary>
internal static class SessionEndpoints
{
    public sealed record ConnexionRequest(string? Identifiant, string? MotDePasse);

    public sealed record InstallationRequest(string? Code, string? Organisation, string? Identifiant, string? Nom, string? MotDePasse);

    public sealed record ChangementRequest(string? Actuel, string? Nouveau);

    /// <summary>Même réponse pour un compte inconnu et un mauvais mot de passe.</summary>
    internal const string Refus = "Identifiant ou mot de passe incorrect.";

    internal static IResult Champs(int statut, string erreur, IReadOnlyList<ErreurChamp> champs) =>
        Results.Json(new { erreur, champs = champs.Select(c => new { champ = c.Champ, message = c.Message }) }, statusCode: statut);

    private static IResult Patienter(HttpContext http, TimeSpan attente, string message)
    {
        http.Response.Headers.RetryAfter = ((int)attente.TotalSeconds).ToString();
        return Results.Json(new { erreur = message }, statusCode: StatusCodes.Status429TooManyRequests);
    }

    public static RouteGroupBuilder MapSessionEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/session", (HttpContext http, AccesUsines acces) =>
            http.User.OrganisationId() is not null ? Results.Ok(http.User.Vue()) : Results.Ok(new { connecte = false, demo = acces.DemoOuverte }))
            .PermisAvantChangement();

        api.MapPost("/session", async (ConnexionRequest req, ComptesService comptes, EssaisConnexion essais, HttpContext http, ILoggerFactory logs, CancellationToken ct) =>
        {
            var adresse = EssaisConnexion.Adresse(http);
            var identifiant = ComptesService.Normaliser(req.Identifiant);
            if (identifiant.Length > ComptesService.IdentifiantMax) identifiant = identifiant[..ComptesService.IdentifiantMax];
            if (essais.Connexion(adresse, identifiant) is { } attente)
                return Patienter(http, attente, "Trop d'essais de connexion : patientez une minute avant de réessayer.");
            var compte = await comptes.AuthentifierAsync(req.Identifiant, req.MotDePasse, ct);
            if (compte is null || await comptes.OrganisationAsync(compte.OrganisationId, ct) is not { } organisation)
            {
                essais.EchecConnexion(adresse, identifiant);
                logs.CreateLogger("EVAN.Session").LogWarning("Connexion refusée depuis {Adresse}", adresse);
                return Results.Json(new { erreur = Refus }, statusCode: StatusCodes.Status401Unauthorized);
            }
            // Bon mot de passe, mais provisoire de plus de 72 h : le dire, puisque seul son titulaire le connaît.
            if (comptes.ProvisoireExpire(compte))
                return Results.Json(new { erreur = "Mot de passe provisoire expiré (72 h) : demandez-en un nouveau à un administrateur.", code = Garde.CodeProvisoireExpire },
                    statusCode: StatusCodes.Status401Unauthorized);
            await http.OuvrirAsync(compte, organisation);
            return Results.Ok(Identite.Principal(compte, organisation).Vue());
        }).PermisAvantChangement();

        // Changement de son mot de passe : l'actuel est exigé, et ses échecs comptent comme ceux de la connexion. La
        // génération augmente : les autres sessions du compte et son temps réel tombent, celle-ci est rouverte.
        api.MapPut("/session/mot-de-passe", async (ChangementRequest req, ComptesService comptes, EssaisConnexion essais, CacheSessions cache,
            SessionsTempsReel tempsReel, HttpContext http, ILoggerFactory logs, CancellationToken ct) =>
        {
            var adresse = EssaisConnexion.Adresse(http);
            var identifiant = http.User.FindFirstValue(ClaimTypes.Email) ?? "";
            if (essais.Connexion(adresse, identifiant) is { } attente)
                return Patienter(http, attente, "Trop d'essais : patientez une minute avant de réessayer.");
            var r = await comptes.ChangerMotDePasseAsync(identifiant, req.Actuel, req.Nouveau, ct);
            if (r.Erreurs.Any(e => e.Champ == "actuel")) essais.EchecConnexion(adresse, identifiant);
            if (r.Compte is not { } compte)
                return Champs(StatusCodes.Status400BadRequest, "Mot de passe inchangé : corrigez les champs signalés.", r.Erreurs);
            cache.Oublier(compte.Id);
            tempsReel.Fermer(compte.Id);
            if (await comptes.OrganisationAsync(compte.OrganisationId, ct) is { } organisation) await http.OuvrirAsync(compte, organisation);
            else await http.FermerAsync();
            await comptes.JournaliserAsync(new EvenementCompte(compte.OrganisationId, compte.Id, compte.Identifiant, compte.Id, compte.Identifiant,
                ActionCompte.Changement, adresse, comptes.Maintenant()), ct);
            logs.CreateLogger("EVAN.Session").LogInformation("Compte {Compte} : mot de passe changé par son titulaire", compte.Id);
            return Results.NoContent();
        }).RequireAuthorization(Politiques.Membre).PermisAvantChangement();

        // Déconnexion : révoquée côté serveur (génération augmentée), si bien qu'une copie du cookie ne vaut plus rien.
        // Toutes les sessions du compte tombent, sur tous les postes, et son temps réel est coupé.
        api.MapDelete("/session", async (HttpContext http, ComptesService comptes, CacheSessions cache, SessionsTempsReel tempsReel, CancellationToken ct) =>
        {
            if (http.User.OrganisationId() is not null && http.User.FindFirstValue(ClaimTypes.NameIdentifier) is { Length: > 0 } id)
            {
                await comptes.DeconnecterAsync(id, ct);
                cache.Oublier(id);
                tempsReel.Fermer(id);
            }
            await http.FermerAsync();
            return Results.NoContent();
        }).PermisAvantChangement();

        api.MapPost("/installation", async (InstallationRequest req, ComptesService comptes, EssaisConnexion essais, IConfiguration config, HttpContext http, ILoggerFactory logs, CancellationToken ct) =>
        {
            // Sans code configuré, la route n'existe pas.
            if (config["Evan:CodeInstallation"]?.Trim() is not { Length: > 0 } attendu) return Results.NotFound();
            var adresse = EssaisConnexion.Adresse(http);
            if (essais.Installation(adresse) is { } attente) return Patienter(http, attente, "Trop de codes refusés : patientez quelques minutes.");
            if (!CodeValide(req.Code, attendu))
            {
                essais.EchecInstallation(adresse);
                logs.CreateLogger("EVAN.Session").LogWarning("Code d'installation refusé depuis {Adresse}", adresse);
                return Results.Json(new { erreur = "Code d'installation refusé." }, statusCode: StatusCodes.Status403Forbidden);
            }
            var r = await comptes.InstallerAsync(req.Organisation, new NouveauCompte(req.Identifiant, req.Nom, req.MotDePasse), ct);
            if (!r.Reussi) return Champs(r.Conflit ? StatusCodes.Status409Conflict : StatusCodes.Status400BadRequest, "Installation refusée : corrigez les champs signalés.", r.Erreurs);
            logs.CreateLogger("EVAN.Session").LogInformation("Organisation {Organisation} créée avec son administrateur", r.Organisation!.Id);
            await http.OuvrirAsync(r.Compte!, r.Organisation);
            return Results.Json(Identite.Principal(r.Compte!, r.Organisation).Vue(), statusCode: StatusCodes.Status201Created);
        });
        return api;
    }

    /// <summary>Comparaison à temps constant (empreintes de même longueur) : la durée ne dit rien du code attendu.</summary>
    internal static bool CodeValide(string? code, string attendu) =>
        CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(code?.Trim() ?? "")), SHA256.HashData(Encoding.UTF8.GetBytes(attendu)));
}
