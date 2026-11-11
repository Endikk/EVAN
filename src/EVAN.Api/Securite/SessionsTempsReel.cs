using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

namespace EVAN.Api.Securite;

/// <summary>
/// Connexions temps réel ouvertes par compte. Un WebSocket ne repasse pas par le cookie une fois ouvert : sans ce
/// registre, un compte retiré continuerait de recevoir les mesures de l'usine jusqu'à la fermeture de son onglet.
/// Filtre de tous les hubs : chaque connexion d'un compte connecté est suivie de son ouverture à sa fermeture, et
/// <see cref="Fermer"/> coupe toutes celles d'un compte. Les connexions sans compte (démo) ne sont pas suivies.
/// </summary>
public sealed class SessionsTempsReel : IHubFilter
{
    private readonly object _verrou = new();
    private readonly Dictionary<string, Dictionary<string, HubCallerContext>> _parCompte = new();

    private static string? CompteDe(HubCallerContext connexion) =>
        connexion.User?.Identity?.IsAuthenticated == true ? connexion.User.FindFirstValue(ClaimTypes.NameIdentifier) : null;

    public void Suivre(HubCallerContext connexion)
    {
        if (CompteDe(connexion) is not { } compte) return;
        lock (_verrou)
        {
            if (!_parCompte.TryGetValue(compte, out var connexions)) _parCompte[compte] = connexions = new();
            connexions[connexion.ConnectionId] = connexion;
        }
    }

    public void Oublier(HubCallerContext connexion)
    {
        if (CompteDe(connexion) is not { } compte) return;
        lock (_verrou)
        {
            if (_parCompte.TryGetValue(compte, out var connexions) && connexions.Remove(connexion.ConnectionId) && connexions.Count == 0)
                _parCompte.Remove(compte);
        }
    }

    /// <summary>Coupe toutes les connexions temps réel de ce compte ; rend leur nombre.</summary>
    public int Fermer(string compteId)
    {
        List<HubCallerContext> aCouper;
        lock (_verrou)
        {
            if (!_parCompte.Remove(compteId, out var connexions)) return 0;
            aCouper = [.. connexions.Values];
        }
        foreach (var connexion in aCouper) connexion.Abort();
        return aCouper.Count;
    }

    public async Task OnConnectedAsync(HubLifetimeContext context, Func<HubLifetimeContext, Task> next)
    {
        // Mot de passe provisoire à changer : pas de temps réel avant le changement (Garde).
        if (context.Context.User is { } attente && Garde.DoitChanger(attente))
        {
            context.Context.Abort();
            return;
        }
        Suivre(context.Context);
        // Retrait tombé entre la vérification du cookie et l'inscription ci-dessus : Fermer ne pouvait pas encore voir
        // cette connexion. Relue une fois inscrite, elle ne peut plus passer entre les deux.
        if (context.Context.User is { Identity.IsAuthenticated: true } user
            && context.Context.GetHttpContext() is { } http
            && !await ValidationSession.EncoreValideAsync(user, http.RequestServices, context.Context.ConnectionAborted))
        {
            context.Context.Abort();
            return;
        }
        await next(context);
    }

    public async Task OnDisconnectedAsync(HubLifetimeContext context, Exception? exception, Func<HubLifetimeContext, Exception?, Task> next)
    {
        Oublier(context.Context);
        await next(context, exception);
    }
}
