using EVAN.Application.Live;
using EVAN.Core.Domain.Alarms;

namespace EVAN.Application.Abstractions;

/// <summary>Diffusion temps réel vers les écrans (implémentée en SignalR dans l'API).</summary>
public interface IRealtimeNotifier
{
    Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default);
    Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default);
    Task EventAsync(string siteId, Evenement e, CancellationToken ct = default);
    Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default);
}
