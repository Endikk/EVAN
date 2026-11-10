using EVAN.Api.Securite;
using EVAN.Application.Abstractions;
using EVAN.Application.Assistant;

namespace EVAN.Api.Endpoints;

internal static class HealthEndpoints
{
    public static RouteGroupBuilder MapHealthEndpoints(this RouteGroupBuilder api)
    {
        // Usines que ce visiteur voit (le front y cherche la sienne) : jamais celles d'une autre organisation.
        api.MapGet("/health", (HttpContext http, AccesUsines acces, IStore store, IMessageBus bus, AssistantService assistant) => Results.Ok(new
        {
            service = "evan-api",
            version = typeof(HealthEndpoints).Assembly.GetName().Version?.ToString(),
            sites = acces.Visibles(http.User).Select(u => u.Usine.Site.Id),
            mqtt = bus.IsConnected,
            stockage = store.Kind,
            stockageOk = store.Healthy,
            assistant = assistant.Disponible,
            mcp = EVAN.Mcp.DependencyInjection.Route,
        }));
        return api;
    }
}
