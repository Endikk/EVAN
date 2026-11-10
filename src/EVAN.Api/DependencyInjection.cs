using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using EVAN.Api.Endpoints;
using EVAN.Api.Realtime;
using EVAN.Api.Securite;
using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Mcp;

namespace EVAN.Api;

public static class DependencyInjection
{
    /// <summary>
    /// Présentation : SignalR (port de diffusion temps réel), JSON HTTP, CORS du front, serveur MCP, garde de l'assistant et du MCP,
    /// comptes et session, délai des lectures en base, réglages du temps réel.
    /// </summary>
    public static IServiceCollection AddEvanApi(this IServiceCollection services, IConfiguration config)
    {
        services.AddEvanMcp();
        services.AddGardeIa(config);
        services.AddEvanSession(config);
        services.AddEvanTimeouts();
        // Corps de requête : 64 ko (30 Mo par défaut). La garde de l'assistant et du MCP relève sa propre limite à 128 ko.
        services.Configure<KestrelServerOptions>(o => o.Limits.MaxRequestBodySize = Bornes.CorpsMax);
        services.AddSingleton(new LiveOptions { LiaisonPerdueSecondes = config.GetValue("Evan:LiaisonPerdueSecondes", 5.0) });
        services.AddSingleton<IRealtimeNotifier, SignalRNotifier>();
        services.AddHostedService<TelemetryBroadcaster>();

        services.AddSignalR().AddJsonProtocol(o => o.PayloadSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);
        services.ConfigureHttpJsonOptions(o => o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull);
        services.AddCors(o => o.AddDefaultPolicy(p =>
            p.WithOrigins(config.GetSection("Evan:CorsOrigins").Get<string[]>() ?? ["http://localhost:5173"])
             .AllowAnyHeader().AllowAnyMethod().AllowCredentials()));
        return services;
    }

    /// <summary>
    /// Chaîne des requêtes, dans l'ordre, puis la table des routes. Partagée par Program et les tests de l'API : ce que
    /// les tests vérifient (session, cloisonnement, en-tête des écritures) est bien ce qui tourne.
    /// </summary>
    public static WebApplication UseEvanApi(this WebApplication app)
    {
        app.UseCors();
        // Session par cookie, puis les droits des routes qui en exigent un (configuration, comptes, passerelle).
        app.UseAuthentication();
        app.UseAuthorization();
        // Écritures : en-tête X-Evan exigé (protection contre les requêtes venues d'un autre site).
        app.UseProtectionEcritures();
        // Corps plus grand pour les routes qui le déclarent (configuration complète d'une usine).
        app.UseTailleCorps();
        // WebSocket du hub compressé (permessage-deflate) quand le navigateur le propose.
        app.UseCompressionHub();
        // Délai des lectures en base (EvanApi.TimeoutLecture) : la requête SQL est annulée avec la requête HTTP.
        app.UseRequestTimeouts();
        // Après le routage (implicite) : la garde lit la route choisie ; seuls l'assistant et /mcp sont concernés.
        app.UseGardeIa();
        app.MapEvanApi();
        return app;
    }

    /// <summary>Lectures en base (séries, alarmes, journal) : 30 s au plus, annulées jusqu'à la requête SQL.</summary>
    internal static IServiceCollection AddEvanTimeouts(this IServiceCollection services) =>
        services.AddRequestTimeouts(o => o.AddPolicy(EvanApi.TimeoutLecture, TimeSpan.FromSeconds(30)));
}
