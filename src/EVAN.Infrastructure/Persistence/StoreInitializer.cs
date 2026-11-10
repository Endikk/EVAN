using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Core.Domain.Catalog;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EVAN.Infrastructure.Persistence;

/// <summary>
/// Crée le schéma et l'usine d'exemple au démarrage, sans bloquer l'API si la base tarde (elle est attendue sans limite),
/// puis reprend du temps réel ce que la base garde : usines enregistrées par les organisations, alarmes ouvertes et journal.
/// </summary>
internal sealed class StoreInitializer(IStore store, ReferenceData data, LiveService live, ILogger<StoreInitializer> log) : BackgroundService
{
    private static readonly TimeSpan AttenteMax = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await store.InitializeAsync(data, stoppingToken);
            await RestoreAsync(stoppingToken);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // arrêt de l'API avant que la base réponde
        }
    }

    private async Task RestoreAsync(CancellationToken ct)
    {
        var delay = TimeSpan.FromSeconds(1);
        while (true)
        {
            try
            {
                await live.RestoreAsync(ct);
                return;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                log.LogWarning(ex, "Reprise des alarmes et du journal en échec, nouvel essai dans {Delay} s", delay.TotalSeconds);
                await Task.Delay(delay, ct);
                delay = TimeSpan.FromTicks(Math.Min(delay.Ticks * 2, AttenteMax.Ticks));
            }
        }
    }
}
