using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using EVAN.Gateway.Publishing;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Gateway.Tests;

/// <summary>État publié au changement et au battement, plus annoncé après une perte de liaison ; mesures non finies écartées.</summary>
public class TelemetryPublisherTests
{
    private static readonly DateTimeOffset T0 = new(2026, 10, 8, 8, 0, 0, TimeSpan.Zero);

    private static TelemetryPublisher Publisher() =>
        new(new GatewayOptions { SiteId = "site-tours", GatewayId = "tours-01" }, NullLogger<TelemetryPublisher>.Instance, (_, _, _) => Task.FromResult(true), () => true);

    private static List<OutboxItem> Sortie(TelemetryPublisher p)
    {
        var items = new List<OutboxItem>();
        while (p.Outbox.TryRead(out var item)) items.Add(item);
        return items;
    }

    private static int Etats(TelemetryPublisher p) => Sortie(p).Count(i => i.Topic == Topics.State("site-tours", "m-pv01"));

    [Fact]
    public void L_etat_part_au_changement_et_au_battement_seulement()
    {
        var p = Publisher();
        var battement = TimeSpan.FromMilliseconds(new GatewayOptions().StateHeartbeatMs);
        p.State("m-pv01", "marche");

        p.Tick(T0);
        Assert.Equal(1, Etats(p));
        p.Tick(T0.AddSeconds(1));
        Assert.Equal(0, Etats(p));
        p.Tick(T0 + battement);
        Assert.Equal(1, Etats(p));

        p.State("m-pv01", "arret");
        p.Tick(T0 + battement + TimeSpan.FromMilliseconds(100));
        Assert.Equal(1, Etats(p));
    }

    [Fact]
    public void Apres_une_perte_de_liaison_la_machine_n_est_plus_annoncee_puis_revient_aussitot()
    {
        var p = Publisher();
        p.State("m-pv01", "marche");
        p.Tick(T0);
        Sortie(p);

        p.Lost("m-pv01");
        for (var s = 1; s <= 30; s++) p.Tick(T0.AddSeconds(s));
        Assert.Equal(0, Etats(p));

        p.State("m-pv01", "marche");
        p.Tick(T0.AddSeconds(31));
        Assert.Equal(1, Etats(p));
    }

    [Fact]
    public void Une_mesure_non_finie_n_est_pas_publiee()
    {
        var p = Publisher();
        p.Push("m-pv01", new Metric("m-pv01.o1.tension", double.NaN));
        p.Push("m-pv01", new Metric("m-pv01.o1.tension", double.PositiveInfinity));
        p.Push("m-pv01", new Metric("m-pv01.o1.tension", 180));

        p.Tick(T0);

        var telemetrie = Assert.Single(Sortie(p));
        Assert.Equal(180, Assert.Single(((TelemetryMessage)telemetrie.Payload).Metrics).Value);
    }
}
