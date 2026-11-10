using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Core.Domain.Alarms;
using Microsoft.AspNetCore.SignalR;

namespace EVAN.Api.Realtime;

/// <summary>Port <see cref="IRealtimeNotifier"/> sur SignalR.</summary>
public sealed class SignalRNotifier(IHubContext<SupervisionHub> hub) : IRealtimeNotifier
{
    public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) =>
        hub.Clients.Group(siteId).SendAsync("telemetry", new { values, machines }, ct);

    public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default) => hub.Clients.Group(siteId).SendAsync("alarm", alarm, ct);

    public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default) => hub.Clients.Group(siteId).SendAsync("event", e, ct);

    public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default) => hub.Clients.Group(siteId).SendAsync("trace", trace, ct);
}
