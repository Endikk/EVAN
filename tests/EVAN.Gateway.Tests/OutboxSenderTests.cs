using System.Threading.Channels;
using EVAN.Gateway.Publishing;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Gateway.Tests;

/// <summary>
/// File d'envoi : un message ne sort qu'une fois accusé, l'ordre est gardé par sujet, un message refusé par un broker
/// joignable est abandonné au bout de quelques refus, une coupure ne compte pas comme un refus.
/// </summary>
public class OutboxSenderTests
{
    private sealed class Broker
    {
        private readonly object _gate = new();
        public readonly List<string> Recus = new();
        public readonly HashSet<string> Refuse = new();
        public readonly HashSet<string> EchoueUneFois = new();
        public bool Connecte = true;

        public Task<bool> PublishAsync(string topic, object payload, CancellationToken ct)
        {
            var id = (string)payload;
            lock (_gate)
            {
                if (!Connecte || Refuse.Contains(id) || EchoueUneFois.Remove(id)) return Task.FromResult(false);
                Recus.Add(id);
            }
            return Task.FromResult(true);
        }
    }

    private static (OutboxSender Sender, Broker Broker) Banc(params (string Topic, string Id)[] messages)
    {
        var file = Channel.CreateUnbounded<OutboxItem>();
        foreach (var (topic, id) in messages) file.Writer.TryWrite(new OutboxItem(topic, id));
        var broker = new Broker();
        return (new OutboxSender(file.Reader, broker.PublishAsync, () => broker.Connecte, NullLogger.Instance), broker);
    }

    [Fact]
    public async Task L_ordre_est_garde_par_sujet_et_un_echec_ne_perd_rien()
    {
        var (sender, broker) = Banc(("a", "a1"), ("a", "a2"), ("b", "b1"), ("a", "a3"));
        broker.EchoueUneFois.Add("a1");

        await sender.SendOnceAsync(CancellationToken.None);
        Assert.Equal(["b1"], broker.Recus);
        Assert.Equal(3, sender.EnAttente);

        await sender.SendOnceAsync(CancellationToken.None);
        Assert.Equal(["b1", "a1", "a2", "a3"], broker.Recus);
        Assert.Equal(0, sender.EnAttente);
    }

    [Fact]
    public async Task Un_message_refuse_plusieurs_fois_est_abandonne_sans_bloquer_les_autres()
    {
        var (sender, broker) = Banc(("c", "poison"), ("c", "c2"), ("b", "b1"));
        broker.Refuse.Add("poison");

        // Le message suivant du même sujet attend l'abandon du premier, puis part au tour d'après.
        for (var i = 0; i <= OutboxSender.RefusMax; i++) await sender.SendOnceAsync(CancellationToken.None);

        Assert.Equal(1, sender.Abandonnes);
        Assert.Equal(["b1", "c2"], broker.Recus);
        Assert.Equal(0, sender.EnAttente);
    }

    [Fact]
    public async Task Une_coupure_du_broker_ne_compte_pas_comme_un_refus()
    {
        var (sender, broker) = Banc(("a", "a1"));
        broker.Connecte = false;

        for (var i = 0; i < OutboxSender.RefusMax * 2; i++) await sender.SendOnceAsync(CancellationToken.None);
        broker.Connecte = true;
        await sender.SendOnceAsync(CancellationToken.None);

        Assert.Equal(0, sender.Abandonnes);
        Assert.Equal(["a1"], broker.Recus);
    }

    [Fact]
    public async Task Une_publication_qui_leve_ne_tue_pas_l_envoi()
    {
        var file = Channel.CreateUnbounded<OutboxItem>();
        file.Writer.TryWrite(new OutboxItem("a", "a1"));
        var appels = 0;
        var sender = new OutboxSender(file.Reader, (_, _, _) => ++appels == 1 ? throw new IOException("socket fermée") : Task.FromResult(true), () => true, NullLogger.Instance);

        await sender.SendOnceAsync(CancellationToken.None);
        await sender.SendOnceAsync(CancellationToken.None);

        Assert.Equal(2, appels);
        Assert.Equal(0, sender.EnAttente);
    }
}
