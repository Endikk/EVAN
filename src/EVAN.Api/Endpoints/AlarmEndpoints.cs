using EVAN.Api.Securite;
using EVAN.Application.Live;

namespace EVAN.Api.Endpoints;

/// <summary>
/// Actions opérateur sur une alarme : acquitter, résoudre une fois l'intervention terminée, et rouvrir une clôture faite
/// à l'instant. Le cloisonnement (alarmId dans l'adresse) ne laisse agir que sur les usines que l'utilisateur voit.
/// </summary>
internal static class AlarmEndpoints
{
    public static RouteGroupBuilder MapAlarmEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/alarms/{alarmId}/ack", async (string alarmId, LiveService live, HttpContext http) =>
            await live.AcknowledgeAsync(alarmId, http.User.Identity?.Name ?? "Superviseur") is { } a ? Results.Ok(a) : Results.NotFound());

        // L'organisation qui clôt est retenue : elle seule peut annuler la clôture.
        api.MapPost("/alarms/{alarmId}/resolve", async (string alarmId, LiveService live, HttpContext http) =>
            await live.ResolveAsync(alarmId, http.User.Identity?.Name ?? "Maintenance", http.User.OrganisationId()) is { } a ? Results.Ok(a) : Results.NotFound());

        // « Annuler » juste après « Intervention terminée » : seulement par l'organisation qui vient de clore, dans les
        // secondes qui suivent. Une alarme connue qui ne s'y prête pas répond 409, sans rien modifier.
        api.MapPost("/alarms/{alarmId}/reopen", async (string alarmId, LiveService live, HttpContext http) =>
        {
            if (await live.ReopenAsync(alarmId, http.User.Identity?.Name ?? "Maintenance", http.User.OrganisationId()) is { } a) return Results.Ok(a);
            return live.SiteDeAlarme(alarmId) is null
                ? Results.NotFound(new { erreur = "Introuvable." })
                : Results.Conflict(new { erreur = "Cette clôture ne peut plus être annulée : l'alarme n'a pas été close à l'instant depuis votre organisation." });
        });
        return api;
    }
}
