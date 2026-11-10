using EVAN.Application.Live;

namespace EVAN.Api.Endpoints;

/// <summary>Actions opérateur sur une alarme : acquitter, puis résoudre une fois l'intervention terminée.</summary>
internal static class AlarmEndpoints
{
    public static RouteGroupBuilder MapAlarmEndpoints(this RouteGroupBuilder api)
    {
        api.MapPost("/alarms/{alarmId}/ack", async (string alarmId, LiveService live, HttpContext http) =>
            await live.AcknowledgeAsync(alarmId, http.User.Identity?.Name ?? "Superviseur") is { } a ? Results.Ok(a) : Results.NotFound());

        api.MapPost("/alarms/{alarmId}/resolve", async (string alarmId, LiveService live, HttpContext http) =>
            await live.ResolveAsync(alarmId, http.User.Identity?.Name ?? "Maintenance") is { } a ? Results.Ok(a) : Results.NotFound());
        return api;
    }
}
