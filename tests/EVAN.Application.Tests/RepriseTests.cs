using EVAN.Application.Live;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Application.Tests;

/// <summary>Redémarrage de l'API : les alarmes ouvertes et le journal reviennent de la base, sans doublon ni fantôme.</summary>
public class RepriseTests
{
    private const string Site = "site-tours";
    private const string Point = "m-r01.o1.tension";
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    private static Alarme Ouverte(string id, long t) => new()
    {
        Id = id, Code = "TB-101", Message = "Tension hors tolérance", Gravite = "critique", MachineId = "m-r01", OrganeId = "m-r01.o1",
        PointId = Point, Horodatage = t, Statut = "acquittee", AcquitteePar = "Équipe de nuit", AcquitteeLe = t + 60_000, Regle = "seuil",
    };

    private static TelemetryMessage HorsLimite(DateTimeOffset ts) => new() { SiteId = Site, MachineId = "m-r01", Ts = ts, Metrics = [new Metric(Point, 260)] };

    [Fact]
    public async Task Les_alarmes_ouvertes_et_le_journal_reviennent_et_la_regle_ne_les_double_pas()
    {
        var maintenant = DateTimeOffset.UtcNow;
        var store = new TestStore();
        store.EnBase.Add((Site, Ouverte("al-avant", maintenant.AddHours(-1).ToUnixTimeMilliseconds())));
        store.EnBase.Add((Site, Ouverte("al-vieille", maintenant.AddDays(-8).ToUnixTimeMilliseconds())));
        store.EnBase.Add(("site-crissey", Ouverte("al-ailleurs", maintenant.AddHours(-1).ToUnixTimeMilliseconds())));
        store.JournalEnBase.Add((Site, new Evenement("ev-avant", "action", maintenant.AddHours(-1).ToUnixTimeMilliseconds(), "Alarme TB-101 acquittée", "m-r01", "Équipe de nuit")));
        var live = new LiveService(Data, store, new TestNotifier(), new TestBus(), NullLogger<LiveService>.Instance);

        await live.RestoreAsync(CancellationToken.None);

        var reprise = Assert.Single(live.ActiveAlarms(Site));
        Assert.Equal(("al-avant", "acquittee"), (reprise.Id, reprise.Statut));
        Assert.Contains(live.Direct(Site)!.Evenements, e => e.Id == "ev-avant");
        Assert.Equal("panne", live.Direct(Site)!.Machines["m-r01"].Etat);

        // La mesure toujours hors limite ne lève pas une seconde alarme sur ce point ; une seconde reprise ne double rien.
        live.HandleTelemetry(HorsLimite(maintenant), maintenant);
        await live.RestoreAsync(CancellationToken.None);
        Assert.Equal("al-avant", Assert.Single(live.ActiveAlarms(Site)).Id);
        Assert.Single(live.Direct(Site)!.Evenements, e => e.Id == "ev-avant");
    }

    [Fact]
    public async Task Une_alarme_levee_avant_que_la_base_reponde_remplace_l_ancienne_qui_est_close()
    {
        var maintenant = DateTimeOffset.UtcNow;
        var store = new TestStore();
        store.EnBase.Add((Site, Ouverte("al-avant", maintenant.AddHours(-1).ToUnixTimeMilliseconds())));
        var live = new LiveService(Data, store, new TestNotifier(), new TestBus(), NullLogger<LiveService>.Instance);
        live.HandleTelemetry(HorsLimite(maintenant), maintenant);
        var nouvelle = Assert.Single(live.ActiveAlarms(Site));

        await live.RestoreAsync(CancellationToken.None);

        Assert.Equal(nouvelle.Id, Assert.Single(live.ActiveAlarms(Site)).Id);
        Assert.True(await Attente.Jusqua(() => store.AlarmWrites.Any(a => a.Id == "al-avant" && a.Statut == "resolue")), "l'ancienne alarme reste ouverte en base");
    }

    [Fact]
    public async Task La_remise_a_zero_de_la_demo_clot_aussi_les_alarmes_en_base()
    {
        var maintenant = DateTimeOffset.UtcNow;
        var store = new TestStore();
        var live = new LiveService(Data, store, new TestNotifier(), new TestBus(), NullLogger<LiveService>.Instance);
        live.HandleTelemetry(HorsLimite(maintenant), maintenant);
        var ouverte = Assert.Single(live.ActiveAlarms(Site));

        await live.ResetAsync(Site);

        Assert.Empty(live.ActiveAlarms(Site));
        // Sans cette écriture, le prochain démarrage de l'API reprendrait l'alarme depuis la base.
        Assert.True(await Attente.Jusqua(() => store.AlarmWrites.Any(a => a.Id == ouverte.Id && a.Statut == "resolue")), "l'alarme reste ouverte en base");
    }
}
