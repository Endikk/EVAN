using System.Reflection;
using System.Security.Claims;
using EVAN.Application.Live;

namespace EVAN.Api.Securite;

/// <summary>
/// Cloisonnement par organisation. Une usine de la démo (data/demo.json) est ouverte à tous tant que Evan:DemoEnabled
/// vaut vrai, avec les écritures bornées de la démo ; une usine réelle ne se voit qu'avec un compte de son organisation.
/// Ce qu'on ne voit pas n'existe pas : l'API répond 404, jamais 403, pour ne rien laisser deviner.
/// </summary>
public sealed class AccesUsines(LiveService live, IConfiguration config)
{
    public bool DemoOuverte { get; } = config.GetValue("Evan:DemoEnabled", true);

    public bool EstDemo(string? siteId) => siteId is not null && live.OrganisationDe(siteId) == live.Organisation.Id;

    /// <summary>Vrai si cet utilisateur (connecté ou non) peut voir cette usine et y agir.</summary>
    public bool Voit(ClaimsPrincipal user, string? siteId)
    {
        if (siteId is null || live.OrganisationDe(siteId) is not { } organisation) return false;
        return organisation == live.Organisation.Id ? DemoOuverte : user.OrganisationId() == organisation;
    }

    /// <summary>Usines que cet utilisateur voit, dans l'ordre de chargement.</summary>
    public IEnumerable<UsineChargee> Visibles(ClaimsPrincipal user) => live.Usines.Where(u => Voit(user, u.Usine.Site.Id));

    /// <summary>
    /// Usines de « son » organisation : celle du compte connecté, ou la démo sans compte (si elle est ouverte).
    /// </summary>
    public IEnumerable<UsineChargee> DeSonOrganisation(ClaimsPrincipal user) => user.OrganisationId() is { } org
        ? live.Usines.Where(u => u.OrganisationId == org)
        : DemoOuverte ? live.Usines.Where(u => u.OrganisationId == live.Organisation.Id) : [];
}

/// <summary>La route contrôle elle-même l'accès à l'usine de son adresse (création d'une usine par PUT).</summary>
public sealed class AccesVerifieParLaRoute;

/// <summary>
/// Filtre du groupe /api : toute route qui porte un siteId, machineId, pointId ou alarmId (dans l'adresse, ou un
/// SiteId dans le corps) ne sert que les usines que l'utilisateur voit, et répond 404 sinon. Une nouvelle route en
/// profite sans rien déclarer. Machine et alarme inconnues du temps réel ne peuvent viser que les lectures de la démo
/// (historique simulé) : elles passent si la démo est ouverte. Un point inconnu ne passe jamais (ses séries en base
/// pourraient venir d'une usine d'une autre organisation). Les routes /api/demo n'agissent que sur la démo.
/// </summary>
internal sealed class FiltreAccesUsine(AccesUsines acces, LiveService live) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext ctx, EndpointFilterDelegate suite)
    {
        var http = ctx.HttpContext;
        if (http.GetEndpoint()?.Metadata.GetMetadata<AccesVerifieParLaRoute>() is null && !Autorise(http, ctx.Arguments))
            return Results.NotFound(new { erreur = "Introuvable." });
        return await suite(ctx);
    }

    private bool Autorise(HttpContext http, IList<object?> arguments)
    {
        var user = http.User;
        var route = http.Request.RouteValues;
        if (route.TryGetValue("siteId", out var site))
        {
            if (!acces.Voit(user, site as string)) return false;
            if (http.Request.Path.StartsWithSegments("/api/demo") && !acces.EstDemo(site as string)) return false;
        }
        if (route.TryGetValue("machineId", out var machine) && !Connue(user, live.SiteDeMachine(machine as string ?? ""))) return false;
        if (route.TryGetValue("alarmId", out var alarme) && !Connue(user, live.SiteDeAlarme(alarme as string ?? ""))) return false;
        if (route.TryGetValue("pointId", out var point) && !acces.Voit(user, live.SiteDePoint(point as string ?? ""))) return false;
        // Usine désignée dans le corps (test de liaison, question à l'assistant). Une usine que le back ne connaît pas
        // (créée dans le navigateur seul) reste à la route, qui ne lit alors que la démo ou répond 404.
        foreach (var argument in arguments)
            if (SiteDuCorps(argument) is { } siteId && live.OrganisationDe(siteId) is not null && !acces.Voit(user, siteId)) return false;
        return true;
    }

    private bool Connue(ClaimsPrincipal user, string? siteId) => siteId is null ? acces.DemoOuverte : acces.Voit(user, siteId);

    private static string? SiteDuCorps(object? argument) =>
        argument?.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(p => p.Name == "SiteId" && p.PropertyType == typeof(string) && p.GetIndexParameters().Length == 0)
            ?.GetValue(argument) as string;
}
