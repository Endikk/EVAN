using EVAN.Application.Abstractions;
using EVAN.Application.Live;

namespace EVAN.Api.Realtime;

/// <summary>
/// Diffusion groupée à 1 Hz : seules les valeurs modifiées partent, avec l'état de toutes les machines (dont « horsLigne »).
/// Un lot dont l'envoi échoue repart au suivant.
/// </summary>
public sealed class TelemetryBroadcaster(LiveService live, IRealtimeNotifier notifier, ILogger<TelemetryBroadcaster> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var siteId in live.SiteIds)
            {
                try
                {
                    if (live.TakeTelemetry(siteId) is not { } batch) continue;
                    try
                    {
                        await notifier.TelemetryAsync(siteId, batch.Values, batch.Machines, stoppingToken);
                    }
                    catch (Exception) when (!stoppingToken.IsCancellationRequested)
                    {
                        // Les valeurs retirées du lot ne doivent pas attendre le prochain instantané pour réapparaître.
                        live.RequeueTelemetry(siteId, batch.Values.Keys);
                        throw;
                    }
                }
                catch (Exception ex) when (!stoppingToken.IsCancellationRequested)
                {
                    log.LogWarning(ex, "Diffusion temps réel en échec pour {Site}", siteId);
                }
            }
        }
    }
}
