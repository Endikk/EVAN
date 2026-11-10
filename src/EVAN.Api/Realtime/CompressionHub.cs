using System.Net.WebSockets;
using Microsoft.AspNetCore.Http.Features;

namespace EVAN.Api.Realtime;

/// <summary>
/// Compression permessage-deflate du WebSocket du hub : le lot de télémétrie de Tours passe de 15 ko à 1,6 ko par
/// seconde et par écran, l'instantané d'entrée de 53 ko à 9 ko (mesuré sur la pile Docker). SignalR n'a pas d'option
/// pour la demander : l'acceptation du WebSocket est enveloppée pour l'activer. Le navigateur la propose de lui-même ;
/// un client qui ne la propose pas reçoit des trames non compressées, comme avant. Les messages et le protocole sont
/// inchangés.
/// La compression ne fait rien fuiter par la taille des trames (attaques de type CRIME) : le flux ne porte aucun secret,
/// tout écran inscrit à l'usine en reçoit le même contenu.
/// </summary>
internal static class CompressionHub
{
    public static IApplicationBuilder UseCompressionHub(this IApplicationBuilder app) =>
        app.UseWhen(ctx => ctx.Request.Path.StartsWithSegments(SupervisionHub.Route), hub => hub
            // Pose la fonction WebSocket de la requête (SignalR la poserait plus loin, à l'identique) pour l'envelopper.
            .UseWebSockets()
            .Use((ctx, next) =>
            {
                if (ctx.Features.Get<IHttpWebSocketFeature>() is { IsWebSocketRequest: true } ws)
                    ctx.Features.Set<IHttpWebSocketFeature>(new WebSocketCompresse(ws));
                return next(ctx);
            }));

    private sealed class WebSocketCompresse(IHttpWebSocketFeature ws) : IHttpWebSocketFeature
    {
        public bool IsWebSocketRequest => ws.IsWebSocketRequest;

        public Task<WebSocket> AcceptAsync(WebSocketAcceptContext context)
        {
            context.DangerousEnableCompression = true;
            return ws.AcceptAsync(context);
        }
    }
}
