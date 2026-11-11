using System.Globalization;
using System.Security.Claims;
using EVAN.Application.Abstractions;
using EVAN.Application.Comptes;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace EVAN.Api.Securite;

/// <summary>
/// Le cookie de session est chiffré, mais il ne dit que ce qui était vrai à la connexion. Chaque requête qui en porte un
/// compare donc la session à l'état du compte (gardé 10 s au plus, <see cref="CacheSessions"/>) : retiré, recréé à la
/// même adresse, passé dans une autre organisation, changé de rôle, génération différente (mot de passe provisoire,
/// changement de mot de passe, déconnexion), obligation de changer qui ne correspond plus, provisoire expiré, ou session
/// ouverte depuis plus de 24 h : elle tombe tout de suite. Si le stockage ne répond pas, la requête échoue au lieu de
/// passer sans vérification.
/// </summary>
public static class ValidationSession
{
    internal static async Task ValiderAsync(CookieValidatePrincipalContext ctx)
    {
        if (ctx.Principal is { } user && await EncoreValideAsync(user, ctx.HttpContext.RequestServices, ctx.HttpContext.RequestAborted)) return;
        ctx.RejectPrincipal();
        // Le navigateur reçoit aussi l'ordre d'effacer le cookie : il ne le renverra plus.
        await ctx.HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
    }

    /// <summary>Vrai si le compte de cette session existe encore tel que la session le décrit, et si elle n'a pas 24 h.</summary>
    internal static async Task<bool> EncoreValideAsync(ClaimsPrincipal user, IServiceProvider services, CancellationToken ct)
    {
        var maintenant = services.GetRequiredService<TimeProvider>().GetUtcNow();
        if (TropAncienne(user.FindFirstValue(Identite.Ouverte), maintenant)) return false;
        if (user.FindFirstValue(ClaimTypes.Email) is not { Length: > 0 } identifiant
            || user.FindFirstValue(ClaimTypes.NameIdentifier) is not { Length: > 0 } id) return false;
        var store = services.GetRequiredService<IComptesStore>();
        var etat = await services.GetRequiredService<CacheSessions>().ObtenirAsync(id, async () =>
            await store.CompteAsync(identifiant, ct) is { } compte && compte.Id == id ? EtatCompte.De(compte) : null);
        return etat is not null
            && etat.OrganisationId == user.FindFirstValue(Identite.Organisation)
            && etat.Role == user.FindFirstValue(ClaimTypes.Role)
            && etat.Generation == Generation(user)
            && etat.DoitChanger == Garde.DoitChanger(user)
            && !ComptesService.ProvisoireExpire(etat.DoitChanger, etat.ProvisoireLe, maintenant);
    }

    /// <summary>
    /// Vrai si la session a été ouverte il y a plus de <see cref="SessionExtensions.DureeAbsolue"/>. Sans date
    /// lisible (cookie d'avant la règle) : vrai, une connexion suffit à repartir.
    /// </summary>
    public static bool TropAncienne(string? ouverte, DateTimeOffset maintenant) =>
        !long.TryParse(ouverte, NumberStyles.None, CultureInfo.InvariantCulture, out var ms)
        || maintenant - DateTimeOffset.FromUnixTimeMilliseconds(ms) > SessionExtensions.DureeAbsolue;

    /// <summary>
    /// Génération portée par la session. Absente des cookies émis avant elle : 0, la valeur de départ de tout compte.
    /// Illisible : -1, qui ne correspond à aucun compte.
    /// </summary>
    private static int Generation(ClaimsPrincipal user) => user.FindFirstValue(Identite.Generation) switch
    {
        null => 0,
        var v => int.TryParse(v, NumberStyles.None, CultureInfo.InvariantCulture, out var g) ? g : -1,
    };
}
