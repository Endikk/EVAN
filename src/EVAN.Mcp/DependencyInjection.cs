using EVAN.Application.Assistant;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Protocol;
using ModelContextProtocol.Server;

namespace EVAN.Mcp;

/// <summary>
/// Serveur MCP d'EVAN. Les outils sont ceux de l'assistant intégré (<see cref="EvanTools"/>), définis une seule fois :
/// Claude Desktop, Claude Code ou toute application cliente MCP (une application Laravel, par exemple) interrogent
/// l'historique, le carnet de maintenance et ses interventions planifiées, l'énergie et l'état en direct, sans accès en
/// écriture aux machines ni au carnet.
/// </summary>
public static class DependencyInjection
{
    public const string Route = "/mcp";

    private const string Consignes =
        "EVAN supervise des usines d'étiquettes : machines, organes, alarmes, maintenance (plan, interventions planifiées, carnet) et énergie. " +
        "Commencez par l'outil organisation pour situer les usines, puis passez l'identifiant d'usine aux autres outils. " +
        "Les machines se désignent par identifiant (m-r01), numéro (R01) ou nom (Gallus) ; les heures sont en heure de Paris. " +
        "Tous les outils sont en lecture seule.";

    public static IServiceCollection AddEvanMcp(this IServiceCollection services)
    {
        services.AddMcpServer(o =>
            {
                o.ServerInfo = new Implementation { Name = "evan", Title = "EVAN · supervision d'usine", Version = "1.0.0" };
                o.ServerInstructions = Consignes;
            })
            // Sans état : chaque requête se suffit, le serveur se met derrière un équilibreur sans affinité de session.
            .WithHttpTransport(o => o.Stateless = true);

        foreach (var (methode, outil) in EvanTools.Methodes)
        {
            services.AddSingleton(sp => McpServerTool.Create(methode, sp.GetRequiredService<EvanTools>(), new McpServerToolCreateOptions
            {
                Name = outil.Nom,
                Title = outil.Titre,
                ReadOnly = true,
                Destructive = false,
                Idempotent = true,
                OpenWorld = false,
                SerializerOptions = EvanTools.JsonOutils,
                Services = sp,
            }));
        }
        return services;
    }

    /// <summary>Point d'accès Streamable HTTP du serveur MCP ; l'hôte y ajoute ses conventions (accès, limites).</summary>
    public static IEndpointConventionBuilder MapEvanMcp(this IEndpointRouteBuilder app) => app.MapMcp(Route);
}
