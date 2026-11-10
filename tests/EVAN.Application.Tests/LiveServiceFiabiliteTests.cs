using EVAN.Application.Live;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Application.Tests;

/// <summary>
/// Fiabilité du temps réel : ordre et reprise des écritures en base, actions opérateur malgré une base ou un broker
/// coupés, horodatages aberrants, rejeu QoS 1, éviction des alarmes, états machine persistés.
/// </summary>
public class LiveServiceFiabiliteTests
{
    private const string Site = "site-tours";
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    private static LiveService Live(TestStore store, TestNotifier? notifier = null, TestBus? bus = null) =>
        new(Data, store, notifier ?? new TestNotifier(), bus ?? new TestBus(), NullLogger<LiveService>.Instance);

    private static PlcAlarmMessage Automate(string code, bool active, string machine = "m-r01") =>
        new() { SiteId = Site, MachineId = machine, Ts = DateTimeOffset.UtcNow, Code = code, Active = active };

    [Fact]
    public async Task Alarme_levee_puis_close_finit_resolue_en_base_meme_si_la_premiere_ecriture_est_lente()
    {
        var store = new TestStore { RetenirPremiereAlarme = true };
        var live = Live(store);

        live.HandlePlcAlarm(Automate("AU-1", true));
        live.HandlePlcAlarm(Automate("AU-1", false));
        // La levée est retenue par la base : la clôture ne doit pas l'écrire avant elle.
        await Task.Delay(50);
        store.Liberer();

        Assert.True(await Attente.Jusqua(() => store.AlarmWrites.Length >= 2));
        await Task.Delay(50);
        Assert.Equal(["active", "resolue"], store.AlarmWrites.Select(a => a.Statut));
    }

    [Fact]
    public async Task Une_ecriture_d_alarme_en_echec_est_reessayee()
    {
        var store = new TestStore { EchecsAlarme = 1 };
        var live = Live(store);

        live.HandlePlcAlarm(Automate("AU-2", true));

        Assert.True(await Attente.Jusqua(() => store.AlarmWrites.Length == 1, 5000), "l'alarme n'a jamais été écrite");
    }

    [Fact]
    public async Task Acquitter_reussit_et_se_journalise_meme_base_hors_service()
    {
        var store = new TestStore();
        var notifier = new TestNotifier();
        var live = Live(store, notifier);
        live.HandlePlcAlarm(Automate("AU-3", true));
        var id = live.ActiveAlarms(Site).Single().Id;
        store.Panne = true;

        var ack = await live.AcknowledgeAsync(id, "Opératrice");

        Assert.Equal("acquittee", ack?.Statut);
        Assert.Equal("acquittee", live.ActiveAlarms(Site).Single().Statut);
        Assert.Contains(notifier.Alarms, a => a.Id == id && a.Statut == "acquittee");
        Assert.Contains(live.Direct(Site)!.Evenements, e => e.Message.Contains("acquittée"));
    }

    [Fact]
    public async Task Acquitter_reussit_et_part_en_base_meme_si_la_diffusion_echoue()
    {
        var store = new TestStore();
        var notifier = new TestNotifier();
        var live = Live(store, notifier);
        live.HandlePlcAlarm(Automate("AU-6", true));
        var id = live.ActiveAlarms(Site).Single().Id;
        notifier.Panne = true;

        var ack = await live.AcknowledgeAsync(id, "Opératrice");

        Assert.Equal("acquittee", ack?.Statut);
        Assert.True(await Attente.Jusqua(() => store.AlarmWrites.Any(a => a.Id == id && a.Statut == "acquittee")));
        Assert.True(await Attente.Jusqua(() => store.EventWrites.Any(e => e.Message.Contains("acquittée"))));
    }

    [Fact]
    public async Task Resoudre_se_journalise_meme_si_le_broker_coupe_pendant_l_envoi()
    {
        var bus = new TestBus();
        var live = Live(new TestStore(), bus: bus);
        live.HandlePlcAlarm(Automate("AU-4", true));
        var id = live.ActiveAlarms(Site).Single().Id;
        bus.Panne = true;

        var resolue = await live.ResolveAsync(id, "Maintenance");

        Assert.Equal("resolue", resolue?.Statut);
        Assert.Empty(live.ActiveAlarms(Site));
        Assert.Contains(live.Direct(Site)!.Evenements, e => e.Message.StartsWith("Intervention terminée"));
    }

    [Fact]
    public async Task Acquitter_une_alarme_deja_resolue_ne_la_ressuscite_pas()
    {
        var live = Live(new TestStore());
        live.HandlePlcAlarm(Automate("AU-5", true));
        var id = live.ActiveAlarms(Site).Single().Id;
        live.HandlePlcAlarm(Automate("AU-5", false));

        Assert.Null(await live.AcknowledgeAsync(id, "Opératrice"));
        Assert.Null(await live.AcknowledgeAsync("al-inconnue", "Opératrice"));
        Assert.Equal("resolue", live.Direct(Site)!.Alarmes.Single(a => a.Id == id).Statut);
    }

    [Fact]
    public void L_eviction_garde_les_alarmes_ouvertes_tant_qu_il_reste_des_resolues()
    {
        var live = Live(new TestStore());
        live.HandlePlcAlarm(Automate("OUVERTE", true));
        for (var i = 0; i < 2001; i++)
        {
            live.HandlePlcAlarm(Automate($"C-{i}", true));
            live.HandlePlcAlarm(Automate($"C-{i}", false));
        }

        Assert.Contains(live.ActiveAlarms(Site), a => a.Code == "OUVERTE");
        Assert.True(live.Direct(Site)!.Alarmes.Count <= 2000);
    }

    [Fact]
    public void Un_horodatage_aberrant_est_remplace_par_l_heure_de_reception()
    {
        var store = new TestStore();
        var live = Live(store);
        var recu = DateTimeOffset.UtcNow;

        // Pas de SourceTimestamp côté automate : la passerelle a publié l'an 1.
        live.HandleTelemetry(new TelemetryMessage
        {
            SiteId = Site, MachineId = "m-r01", Ts = default, Metrics = [new Metric("m-r01.o1.tension", 180)],
        }, recu);

        Assert.Equal(recu.ToUnixTimeMilliseconds(), live.Direct(Site)!.Valeurs["m-r01.o1.tension"].T);
        Assert.Equal(recu, Assert.Single(store.Rows).Time);
    }

    [Fact]
    public void Un_message_rejoue_en_QoS1_n_est_traite_qu_une_fois()
    {
        var store = new TestStore();
        var live = Live(store);
        var ts = DateTimeOffset.UtcNow;
        var msg = new TelemetryMessage
        {
            SiteId = Site, MachineId = "m-r01", GatewayId = "tours-01", Seq = 42, Ts = ts,
            Metrics = [new Metric("m-r01.o1.tension", 180), new Metric("m-r01.o9.vitesse", 140)],
        };

        live.HandleTelemetry(msg, ts);
        live.HandleTelemetry(msg, ts.AddMilliseconds(400));
        // Même Seq après un redémarrage de la passerelle, mais autre message : traité.
        live.HandleTelemetry(new TelemetryMessage { SiteId = Site, MachineId = "m-r01", Seq = 42, Ts = ts.AddMinutes(1), Metrics = msg.Metrics }, ts.AddMinutes(1));

        Assert.Equal(4, store.Rows.Length);
    }

    [Fact]
    public async Task Un_changement_d_etat_machine_est_persiste()
    {
        var store = new TestStore();
        var live = Live(store);

        live.HandleState(new StateMessage { SiteId = Site, MachineId = "m-r01", Ts = DateTimeOffset.UtcNow, Etat = "marche", Vitesse = 140, Facteur = 0.93 });
        live.HandleState(new StateMessage { SiteId = Site, MachineId = "m-r01", Ts = DateTimeOffset.UtcNow, Etat = "marche", Vitesse = 141, Facteur = 0.94 });
        live.HandleState(new StateMessage { SiteId = Site, MachineId = "m-r01", Ts = DateTimeOffset.UtcNow, Etat = "calage", Vitesse = 0, Facteur = 0 });

        Assert.True(await Attente.Jusqua(() => store.StateWrites.Length >= 2));
        await Task.Delay(50);
        Assert.Equal([("m-r01", "marche"), ("m-r01", "calage")], store.StateWrites);
    }
}
