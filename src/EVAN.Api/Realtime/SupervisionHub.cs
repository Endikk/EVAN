using EVAN.Api.Endpoints;
using EVAN.Api.Securite;
using EVAN.Application.Live;
using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

namespace EVAN.Api.Realtime;

/// <summary>
/// Hub temps réel : un groupe par site. À l'entrée, l'écran reçoit un instantané complet. On ne rejoint que le groupe
/// d'une usine qu'on voit (la démo ouverte, ou une usine de son organisation) : même réponse pour une usine d'une autre
/// organisation que pour une usine inconnue.
/// </summary>
public sealed class SupervisionHub(LiveService live, AccesUsines acces) : Hub
{
    public const string Route = "/hubs/supervision";

    /// <summary>
    /// Rejoint le groupe d'une usine existante. Un identifiant quelconque est refusé : il n'y a rien à y suivre, et chaque
    /// appel garderait un groupe de plus en mémoire tant que la connexion vit.
    /// </summary>
    public async Task Join(string siteId)
    {
        // Même réponse pour un identifiant hors bornes, une usine inconnue ou celle d'une autre organisation.
        if (siteId is not { Length: > 0 and <= Bornes.Identifiant } || !acces.Voit(Context.User ?? new ClaimsPrincipal(), siteId))
            throw new HubException("Usine introuvable.");
        await Groups.AddToGroupAsync(Context.ConnectionId, siteId);
        if (live.Snapshot(siteId) is { } snapshot) await Clients.Caller.SendAsync("snapshot", snapshot);
    }

    public Task Leave(string siteId) => Groups.RemoveFromGroupAsync(Context.ConnectionId, siteId);
}
