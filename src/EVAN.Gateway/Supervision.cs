namespace EVAN.Gateway;

/// <summary>Tâche de fond relancée si elle tombe : l'exception est journalisée au lieu d'arrêter la boucle en silence.</summary>
internal static class Supervision
{
    private static readonly TimeSpan Relance = TimeSpan.FromSeconds(5);

    public static async Task RunAsync(string nom, Func<CancellationToken, Task> boucle, ILogger log, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await boucle(ct);
                return;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                log.LogError(ex, "Tâche « {Nom} » tombée, relance dans {Delai} s", nom, Relance.TotalSeconds);
                await Task.Delay(Relance, ct).ContinueWith(_ => { });
            }
        }
    }
}
