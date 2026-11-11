using System.Globalization;
using System.Security.Claims;
using EVAN.Application.Abstractions;
using EVAN.Application.Comptes;
using EVAN.Core.Domain.Sites;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.SignalR;

namespace EVAN.Api.Securite;

/// <summary>Ce que porte la session d'un utilisateur connecté : son compte, son rôle et son organisation.</summary>
public static class Identite
{
    public const string Organisation = "evan:organisation";
    public const string NomOrganisation = "evan:organisation-nom";
    /// <summary>Génération du compte à la connexion (<see cref="ValidationSession"/>).</summary>
    public const string Generation = "evan:generation";
    /// <summary>
    /// Ouverture de la session (ms epoch), pour sa durée absolue. Pas IssuedUtc : le glissement le remet à l'heure à
    /// chaque prolongation, une claim reste celle de la connexion.
    /// </summary>
    public const string Ouverte = "evan:ouverte";
    /// <summary>Présente (« 1 ») tant que le mot de passe provisoire n'est pas changé (<see cref="Garde"/>).</summary>
    public const string DoitChanger = "evan:doit-changer";

    public static ClaimsPrincipal Principal(Compte compte, Organisation organisation, DateTimeOffset ouverte = default)
    {
        List<Claim> claims =
        [
            new Claim(ClaimTypes.NameIdentifier, compte.Id),
            new Claim(ClaimTypes.Name, compte.Nom),
            new Claim(ClaimTypes.Email, compte.Identifiant),
            new Claim(ClaimTypes.Role, compte.Role),
            new Claim(Organisation, organisation.Id),
            new Claim(NomOrganisation, organisation.Nom),
            new Claim(Generation, compte.Generation.ToString(CultureInfo.InvariantCulture)),
            new Claim(Ouverte, ouverte.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture)),
        ];
        if (compte.DoitChanger) claims.Add(new Claim(DoitChanger, "1"));
        return new ClaimsPrincipal(new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme));
    }

    /// <summary>Organisation de l'utilisateur connecté, null sans session.</summary>
    public static string? OrganisationId(this ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true ? user.FindFirstValue(Organisation) : null;

    /// <summary>
    /// Nom qui signe les acquittements, résolutions, interventions et événements : celui du compte connecté. Sans
    /// session (démo), null : l'appelant garde sa signature par défaut.
    /// </summary>
    public static string? Auteur(this ClaimsPrincipal user) =>
        user.Identity?.IsAuthenticated == true ? user.Identity.Name : null;

    /// <summary>Ce que le front montre de la session : jamais l'empreinte, ni rien d'une autre organisation.</summary>
    public static object Vue(this ClaimsPrincipal user) => new
    {
        connecte = true,
        utilisateur = new
        {
            identifiant = user.FindFirstValue(ClaimTypes.Email),
            nom = user.Identity?.Name,
            role = user.FindFirstValue(ClaimTypes.Role),
            // Mot de passe provisoire à changer : le front n'ouvre que le formulaire de changement.
            doitChanger = user.HasClaim(DoitChanger, "1"),
        },
        organisation = new { id = user.FindFirstValue(Organisation), nom = user.FindFirstValue(NomOrganisation) },
    };
}

/// <summary>Politiques d'autorisation : un compte d'une organisation, ou un de ses administrateurs.</summary>
public static class Politiques
{
    public const string Membre = "membre";
    public const string Admin = "admin";
}

public static class SessionExtensions
{
    public const string Cookie = "evan.session";
    /// <summary>Durée d'une session sans activité ; chaque requête dans la seconde moitié la prolonge d'autant.</summary>
    public static readonly TimeSpan Duree = TimeSpan.FromHours(8);
    /// <summary>Durée d'une session depuis la connexion, activité comprise : au-delà, il faut se reconnecter.</summary>
    public static readonly TimeSpan DureeAbsolue = TimeSpan.FromHours(24);

    /// <summary>
    /// Comptes et session par cookie : HttpOnly (illisible par le JavaScript de la page), Secure (jamais envoyé en
    /// clair ; les navigateurs l'acceptent sur http://localhost), SameSite=Strict (jamais joint à une requête venue
    /// d'un autre site), cookie de session du navigateur, 8 h sans activité au plus. L'API répond 401 et 403 en JSON
    /// au lieu de rediriger vers une page de connexion. Clés de chiffrement du cookie dans Evan:DossierCles si défini
    /// (sinon en mémoire ou dans le profil : un redémarrage du conteneur ferme les sessions).
    /// </summary>
    public static IServiceCollection AddEvanSession(this IServiceCollection services, IConfiguration config)
    {
        services.AddSingleton<IMotsDePasse, MotsDePasse>();
        services.AddSingleton<EssaisConnexion>();
        services.AddSingleton<AccesUsines>();
        services.AddSingleton<ActionsMembres>();
        // État des comptes relu au plus toutes les 10 s par session, oublié aussitôt qu'une action le change.
        services.AddSingleton<CacheSessions>();
        // Connexions temps réel suivies par compte : un retrait les coupe aussitôt (filtre de tous les hubs).
        services.AddSingleton<SessionsTempsReel>();
        services.Configure<HubOptions>(o => o.AddFilter<SessionsTempsReel>());
        var cles = services.AddDataProtection().SetApplicationName("EVAN");
        if (config["Evan:DossierCles"] is { Length: > 0 } dossier) cles.PersistKeysToFileSystem(new DirectoryInfo(dossier));

        services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
        {
            o.Cookie.Name = Cookie;
            o.Cookie.HttpOnly = true;
            o.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            o.Cookie.SameSite = SameSiteMode.Strict;
            o.Cookie.Path = "/";
            o.ExpireTimeSpan = Duree;
            o.SlidingExpiration = true;
            o.Events.OnRedirectToLogin = ctx => Refuser(ctx.HttpContext, StatusCodes.Status401Unauthorized, "Connexion requise.");
            o.Events.OnRedirectToAccessDenied = ctx => Refuser(ctx.HttpContext, StatusCodes.Status403Forbidden, "Réservé aux administrateurs de l'organisation.");
            // Le compte est relu à chaque requête : retiré ou réinitialisé, sa session tombe sans attendre l'expiration.
            o.Events.OnValidatePrincipal = ValidationSession.ValiderAsync;
        });
        services.AddAuthorizationBuilder()
            .AddPolicy(Politiques.Membre, p => p.RequireAuthenticatedUser().RequireClaim(Identite.Organisation))
            .AddPolicy(Politiques.Admin, p => p.RequireAuthenticatedUser().RequireClaim(Identite.Organisation).RequireRole(Roles.Admin));
        return services;
    }

    private static Task Refuser(HttpContext ctx, int statut, string message)
    {
        ctx.Response.StatusCode = statut;
        return ctx.Response.WriteAsJsonAsync(new { erreur = message });
    }

    /// <summary>Ouvre (ou rouvre, après un changement de mot de passe) la session de ce compte, datée de maintenant.</summary>
    public static Task OuvrirAsync(this HttpContext http, Compte compte, Organisation organisation) =>
        http.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme,
            Identite.Principal(compte, organisation, http.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow()),
            new AuthenticationProperties { IsPersistent = false, AllowRefresh = true });

    public static Task FermerAsync(this HttpContext http) => http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
}
