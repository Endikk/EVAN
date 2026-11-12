using System.Net.WebSockets;
using EVAN.Api.Realtime;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.TestHost;

namespace EVAN.Api.Tests;

/// <summary>Le WebSocket du hub est accepté avec la compression permessage-deflate, et lui seul.</summary>
public class CompressionHubTests
{
    /// <summary>WebSocket simulé : garde le contexte d'acceptation reçu.</summary>
    private sealed class WebSocketSimule : IHttpWebSocketFeature
    {
        public WebSocketAcceptContext? Recu;
        public bool IsWebSocketRequest => true;

        public Task<WebSocket> AcceptAsync(WebSocketAcceptContext context)
        {
            Recu = context;
            return Task.FromResult(WebSocket.CreateFromStream(Stream.Null, new WebSocketCreationOptions { IsServer = true }));
        }
    }

    private static async Task<bool?> CompressionDemandee(string chemin)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        var simule = new WebSocketSimule();
        app.Use((ctx, next) =>
        {
            ctx.Features.Set<IHttpWebSocketFeature>(simule);
            return next(ctx);
        });
        app.UseCompressionHub();
        app.Run(async ctx =>
        {
            using var ws = await ctx.WebSockets.AcceptWebSocketAsync();
        });
        await app.StartAsync();
        await app.GetTestClient().GetAsync(chemin);
        return simule.Recu?.DangerousEnableCompression;
    }

    [Fact]
    public async Task Le_hub_de_supervision_accepte_son_websocket_compresse()
    {
        Assert.True(await CompressionDemandee($"{SupervisionHub.Route}?id=abc"));
    }

    [Fact]
    public async Task Les_autres_routes_ne_sont_pas_touchees()
    {
        Assert.False(await CompressionDemandee("/mcp"));
    }

    /// <summary>
    /// Sans argument, AcceptWebSocketAsync passe un contexte d'acceptation partagé par tout le processus : l'activer
    /// sur place l'activait aussi pour toutes les acceptations suivantes, quelle que soit la route.
    /// </summary>
    [Fact]
    public async Task Le_hub_ne_change_pas_les_acceptations_suivantes()
    {
        Assert.True(await CompressionDemandee($"{SupervisionHub.Route}?id=abc"));
        Assert.False(await CompressionDemandee("/mcp"));
    }
}
