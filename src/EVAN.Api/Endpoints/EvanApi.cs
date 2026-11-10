using EVAN.Api.Realtime;
using EVAN.Api.Securite;
using EVAN.Mcp;

namespace EVAN.Api.Endpoints;

/// <summary>
/// Table des routes : /api/* (un fichier par ressource), le hub SignalR et le serveur MCP (/mcp). L'assistant
/// (POST /api/assistant) et le serveur MCP sont marqués <see cref="ProtectionIa"/> : la garde les sert.
/// Tout le groupe /api passe par le cloisonnement (<see cref="FiltreAccesUsine"/>) : une route qui porte un siteId,
/// machineId, pointId ou alarmId ne sert que les usines que l'utilisateur voit.
/// Ajouter une ressource = un fichier XxxEndpoints.cs et une ligne ici.
/// </summary>
public static class EvanApi
{
    /// <summary>Délai des lectures en base (séries, alarmes, journal) : au-delà, la requête est annulée jusqu'à la base (504).</summary>
    internal const string TimeoutLecture = "lecture";

    public static WebApplication MapEvanApi(this WebApplication app)
    {
        var api = app.MapGroup("/api").AddEndpointFilter<FiltreAccesUsine>();
        api.MapHealthEndpoints()
           .MapSessionEndpoints()
           .MapOrganisationEndpoints()
           .MapCatalogEndpoints()
           .MapSiteEndpoints()
           .MapPasserelleEndpoints()
           .MapPointEndpoints()
           .MapAlarmEndpoints()
           .MapConnectionEndpoints()
           .MapExploitationEndpoints()
           .MapAssistantEndpoints();
        if (app.Configuration.GetValue("Evan:DemoEnabled", true)) api.MapDemoEndpoints();

        app.MapHub<SupervisionHub>(SupervisionHub.Route);
        app.MapEvanMcp().ProtegerIa(UsageIa.Mcp);
        return app;
    }
}
