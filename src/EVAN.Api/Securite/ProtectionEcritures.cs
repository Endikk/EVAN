namespace EVAN.Api.Securite;

/// <summary>
/// Protection des écritures contre les requêtes intersites (CSRF). Le cookie de session est SameSite=Strict : un
/// navigateur ne le joint pas à une requête partie d'un autre site. En plus, toute écriture sur /api (POST, PUT, PATCH,
/// DELETE) doit porter l'en-tête X-Evan. Un formulaire ou une image d'une page tierce ne sait pas poser d'en-tête ; un
/// script tiers doit d'abord obtenir l'accord CORS, réservé aux origines du front (Evan:CorsOrigins). Cela couvre aussi
/// un sous-domaine voisin, que SameSite tient pour « même site ».
/// Retenu plutôt que l'antiforgery d'ASP.NET Core : rien à aller chercher avant d'écrire, rien à garder côté serveur,
/// et la démo sans compte y est soumise de la même façon.
/// </summary>
public static class ProtectionEcritures
{
    public const string Entete = "X-Evan";
    public const string Valeur = "1";

    private static bool Ecriture(string methode) =>
        HttpMethods.IsPost(methode) || HttpMethods.IsPut(methode) || HttpMethods.IsPatch(methode) || HttpMethods.IsDelete(methode);

    public static IApplicationBuilder UseProtectionEcritures(this IApplicationBuilder app) => app.Use(async (ctx, suite) =>
    {
        if (ctx.Request.Path.StartsWithSegments("/api") && Ecriture(ctx.Request.Method) && ctx.Request.Headers[Entete] != Valeur)
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            await ctx.Response.WriteAsJsonAsync(new { erreur = $"Écriture refusée : en-tête {Entete} absent (protection contre les requêtes venues d'un autre site)." });
            return;
        }
        await suite(ctx);
    });
}
