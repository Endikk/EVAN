using EVAN.Application.Live;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Application.Tests;

/// <summary>
/// Clôture annulée (« Annuler » juste après « Intervention terminée ») et retour à la normale après une intervention,
/// comme le simulateur du navigateur (LocalSimulator.reopen, RulesEngine.forget) : seule l'organisation qui vient de
/// clore peut rouvrir, dans les secondes qui suivent ; la mesure qui revient ne relève pas d'alarme « à surveiller ».
/// </summary>
public class ReouvertureTests
{
    private const string Site = "site-tours";
    private const string Machine = "m-r01";
    private const string Tension = "m-r01.o1.tension";
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    private sealed class Horloge(DateTimeOffset depart) : TimeProvider
    {
        public DateTimeOffset Maintenant { get; set; } = depart;
        public override DateTimeOffset GetUtcNow() => Maintenant;
    }

    private sealed record Banc(LiveService Live, Horloge Horloge, TestNotifier Notifier, TestBus Bus)
    {
        /// <summary>Une seconde plus tard, une mesure de tension de la flexo R01.</summary>
        public void Mesurer(double v)
        {
            Horloge.Maintenant = Horloge.Maintenant.AddSeconds(1);
            Live.HandleTelemetry(new TelemetryMessage { SiteId = Site, MachineId = Machine, Ts = Horloge.Maintenant, Metrics = [new Metric(Tension, v, "N")] },
                Horloge.Maintenant);
        }
    }

    /// <summary>Flexo R01 en production, tension hors limite : une alarme critique ouverte.</summary>
    private static Banc EnPanne()
    {
        var horloge = new Horloge(new DateTimeOffset(2026, 10, 8, 8, 0, 0, TimeSpan.Zero));
        var notifier = new TestNotifier();
        var bus = new TestBus();
        var live = new LiveService(Data, new TestStore(), notifier, bus, NullLogger<LiveService>.Instance, null, horloge);
        live.HandleState(new StateMessage { SiteId = Site, MachineId = Machine, Ts = horloge.Maintenant, Etat = "marche", Vitesse = 140, Facteur = 0.93 });
        var banc = new Banc(live, horloge, notifier, bus);
        foreach (var v in new[] { 200.0, 240, 250 }) banc.Mesurer(v);
        return banc;
    }

    private static string Critique(Banc b) => b.Live.ActiveAlarms(Site).Single(a => a.MachineId == Machine && a.Gravite == "critique").Id;

    [Fact]
    public async Task L_organisation_qui_vient_de_clore_rouvre_l_alarme_et_la_machine_repasse_en_panne()
    {
        var b = EnPanne();
        var id = Critique(b);
        await b.Live.AcknowledgeAsync(id, "Superviseur");
        await b.Live.ResolveAsync(id, "Maintenance", "org-a");
        Assert.Equal("resolue", b.Live.Direct(Site)!.Alarmes.Single(a => a.Id == id).Statut);

        b.Horloge.Maintenant = b.Horloge.Maintenant.AddSeconds(8);
        var rouverte = await b.Live.ReopenAsync(id, "Maintenance", "org-a");

        Assert.NotNull(rouverte);
        // Elle retrouve son état d'avant la clôture : acquittée, sans fin.
        Assert.Equal("acquittee", rouverte.Statut);
        Assert.Null(rouverte.FinLe);
        var vue = b.Live.Direct(Site)!;
        Assert.Equal("acquittee", vue.Alarmes.Single(a => a.Id == id).Statut);
        Assert.Equal("panne", vue.Machines[Machine].Etat);
        Assert.Contains(vue.Evenements, e => e.Message.StartsWith("Clôture annulée", StringComparison.Ordinal) && e.MachineId == Machine);
        Assert.True(await Attente.Jusqua(() => b.Notifier.Alarms.Any(a => a.Id == id && a.Statut == "acquittee")));
        // Le simulateur remet le défaut : la mesure repart vers sa valeur de panne.
        Assert.Contains(b.Bus.Topics, t => t == Topics.SimulatorCommand(Site, "fault"));
        // Le moteur tient de nouveau l'alarme : la mesure toujours hors limite n'en lève pas une seconde.
        b.Mesurer(250);
        Assert.Single(b.Live.ActiveAlarms(Site), a => a.MachineId == Machine && a.Gravite == "critique");
    }

    [Fact]
    public async Task Passe_le_delai_la_cloture_ne_s_annule_plus()
    {
        var b = EnPanne();
        var id = Critique(b);
        await b.Live.ResolveAsync(id, "Maintenance", null);

        b.Horloge.Maintenant = b.Horloge.Maintenant.AddSeconds(31);

        Assert.Null(await b.Live.ReopenAsync(id, "Maintenance", null));
        Assert.Equal("resolue", b.Live.Direct(Site)!.Alarmes.Single(a => a.Id == id).Statut);
    }

    [Fact]
    public async Task Une_autre_organisation_ne_peut_pas_annuler_la_cloture()
    {
        var b = EnPanne();
        var id = Critique(b);
        await b.Live.ResolveAsync(id, "Maintenance", "org-a");

        Assert.Null(await b.Live.ReopenAsync(id, "Intrus", "org-b"));
        Assert.Null(await b.Live.ReopenAsync(id, "Anonyme", null));
        Assert.Equal("resolue", b.Live.Direct(Site)!.Alarmes.Single(a => a.Id == id).Statut);
    }

    [Fact]
    public async Task Une_alarme_jamais_close_ou_inconnue_ne_se_rouvre_pas()
    {
        var b = EnPanne();
        var id = Critique(b);

        Assert.Null(await b.Live.ReopenAsync(id, "Maintenance", null));
        Assert.Null(await b.Live.ReopenAsync("al-inconnue", "Maintenance", null));
        Assert.Equal("active", b.Live.Direct(Site)!.Alarmes.Single(a => a.Id == id).Statut);
    }

    [Fact]
    public async Task Une_cloture_ne_s_annule_qu_une_fois()
    {
        var b = EnPanne();
        var id = Critique(b);
        await b.Live.ResolveAsync(id, "Maintenance", null);

        Assert.NotNull(await b.Live.ReopenAsync(id, "Maintenance", null));
        Assert.Null(await b.Live.ReopenAsync(id, "Maintenance", null));
    }

    [Fact]
    public async Task Apres_l_intervention_la_mesure_qui_revient_ne_releve_pas_d_alarme_a_surveiller()
    {
        var b = EnPanne();
        await b.Live.ResolveAsync(Critique(b), "Maintenance", null);

        // Retour vers 180 N en quelques secondes : la tension repasse par la zone « à surveiller » (212 à 235 N).
        foreach (var v in new[] { 248.0, 230, 220, 214, 205, 192, 185, 182 }) b.Mesurer(v);

        Assert.DoesNotContain(b.Live.ActiveAlarms(Site), a => a.MachineId == Machine);
        Assert.NotEqual("attention", b.Live.Direct(Site)!.Machines[Machine].Etat);
        // Revenue à la normale, la mesure est de nouveau surveillée.
        b.Mesurer(240);
        Assert.Contains(b.Live.ActiveAlarms(Site), a => a.MachineId == Machine && a.PointId == Tension);
    }
}
