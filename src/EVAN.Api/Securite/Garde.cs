using System.Security.Claims;

namespace EVAN.Api.Securite;

/// <summary>
/// Changement obligatoire du mot de passe provisoire. Tant que la session porte <see cref="Identite.DoitChanger"/>,
/// seules les routes marquées <see cref="PermisAvantChangement"/> répondent (lire sa session, se déconnecter, changer
/// son mot de passe), plus la santé de l'API dont le front a besoin pour savoir qu'un serveur répond. Le reste répond
/// 403 avec le code <see cref="CodeMotDePasseAChanger"/>, et le hub temps réel refuse la connexion.
/// </summary>
public static class Garde
{
    public const string CodeMotDePasseAChanger = "mot-de-passe-a-changer";
    public const string CodeProvisoireExpire = "provisoire-expire";

    /// <summary>Marque d'une route permise avant le changement.</summary>
    public sealed class Permise
    {
        internal static readonly Permise Instance = new();
    }

    public static TBuilder PermisAvantChangement<TBuilder>(this TBuilder route) where TBuilder : IEndpointConventionBuilder =>
        route.WithMetadata(Permise.Instance);

    public static bool DoitChanger(ClaimsPrincipal user) => user.Identity?.IsAuthenticated == true && user.HasClaim(Identite.DoitChanger, "1");

    /// <summary>Vrai si cette requête doit attendre le changement du mot de passe provisoire.</summary>
    public static bool Bloquee(HttpContext http) =>
        DoitChanger(http.User)
        && http.GetEndpoint()?.Metadata.GetMetadata<Permise>() is null
        && !http.Request.Path.StartsWithSegments("/api/health");

    public static IResult Refus() => Results.Json(
        new { erreur = "Changez d'abord votre mot de passe provisoire, depuis la page Compte.", code = CodeMotDePasseAChanger },
        statusCode: StatusCodes.Status403Forbidden);
}
