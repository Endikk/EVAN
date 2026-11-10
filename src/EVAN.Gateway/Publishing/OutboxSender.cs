using System.Threading.Channels;

namespace EVAN.Gateway.Publishing;

/// <summary>Message en attente d'envoi ; Refus = refus du broker alors qu'il était joignable.</summary>
internal sealed record OutboxItem(string Topic, object Payload, int Refus = 0);

/// <summary>
/// Vide la file vers le broker. Les messages partent par paquets publiés en parallèle (un sujet à la suite, dans l'ordre),
/// pour ne pas attendre chaque accusé QoS 1 avant le suivant. Un message ne quitte la file qu'une fois accusé ; refusé
/// plusieurs fois par un broker joignable, il est abandonné (journalisé) pour ne pas bloquer les autres. Une coupure
/// ne compte pas comme un refus : le message attend le retour du broker.
/// </summary>
internal sealed class OutboxSender(ChannelReader<OutboxItem> reader, Func<string, object, CancellationToken, Task<bool>> publish, Func<bool> isConnected, ILogger log)
{
    public const int Paquet = 64;
    public const int RefusMax = 5;
    private static readonly TimeSpan Pause = TimeSpan.FromSeconds(1);

    /// <summary>Tête de file : messages lus mais pas encore accusés, renvoyés avant les suivants.</summary>
    private readonly List<OutboxItem> _tete = new();

    public int EnAttente => _tete.Count;
    public long Abandonnes { get; private set; }

    public async Task RunAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            if (_tete.Count == 0 && !await reader.WaitToReadAsync(ct)) return;
            if (!isConnected())
            {
                await Task.Delay(500, ct);
                continue;
            }
            var (envoyes, refuses) = await SendOnceAsync(ct);
            // Rien de parti ou un refus : on laisse respirer le broker au lieu de tourner à vide.
            if (envoyes == 0 || refuses > 0) await Task.Delay(Pause, ct);
        }
    }

    /// <summary>Un paquet : messages accusés retirés, premier échec de chaque sujet gardé en tête (et compté s'il s'agit d'un refus).</summary>
    internal async Task<(int Envoyes, int Refuses)> SendOnceAsync(CancellationToken ct)
    {
        while (_tete.Count < Paquet && reader.TryRead(out var item)) _tete.Add(item);
        if (_tete.Count == 0) return (0, 0);

        var sujets = _tete.GroupBy(i => i.Topic).Select(g => g.ToList()).ToList();
        var partis = await Task.WhenAll(sujets.Select(s => SendTopicAsync(s, ct)));
        var joignable = isConnected();

        var accuses = new HashSet<OutboxItem>(ReferenceEqualityComparer.Instance);
        var echecs = new HashSet<OutboxItem>(ReferenceEqualityComparer.Instance);
        for (var i = 0; i < sujets.Count; i++)
        {
            accuses.UnionWith(sujets[i].Take(partis[i]));
            if (partis[i] < sujets[i].Count) echecs.Add(sujets[i][partis[i]]);
        }

        var refuses = 0;
        var tete = new List<OutboxItem>(_tete.Count);
        foreach (var item in _tete)
        {
            if (accuses.Contains(item)) continue;
            if (!joignable || !echecs.Contains(item))
            {
                tete.Add(item);
                continue;
            }
            refuses++;
            var compte = item with { Refus = item.Refus + 1 };
            if (compte.Refus < RefusMax)
            {
                tete.Add(compte);
                continue;
            }
            Abandonnes++;
            MesuresEnvoi.Perdu("refus");
            log.LogError("Message abandonné sur {Topic} après {Refus} refus du broker (droits, taille ou contenu)", item.Topic, compte.Refus);
        }
        _tete.Clear();
        _tete.AddRange(tete);
        MesuresEnvoi.File(-accuses.Count);
        return (accuses.Count, refuses);
    }

    /// <summary>Messages d'un même sujet, un à la suite de l'autre : un échec arrête la série pour garder l'ordre par machine.</summary>
    private async Task<int> SendTopicAsync(List<OutboxItem> items, CancellationToken ct)
    {
        for (var i = 0; i < items.Count; i++)
        {
            bool ok;
            try
            {
                ok = await publish(items[i].Topic, items[i].Payload, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                log.LogWarning(ex, "Publication sur {Topic} en échec", items[i].Topic);
                ok = false;
            }
            if (!ok) return i;
        }
        return items.Count;
    }
}
