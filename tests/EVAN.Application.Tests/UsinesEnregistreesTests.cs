using EVAN.Application.Live;
using EVAN.Application.Usines;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Application.Tests;

/// <summary>
/// Usines enregistrées par les organisations : validation stricte, enregistrement en mémoire, rechargement au
/// démarrage et reprise de leurs alarmes, modèle d'une machine dont les seuils ont été modifiés.
/// </summary>
public class UsinesEnregistreesTests
{
    private const string Org = "org-dupont";
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    private static ConfigurationUsine Usine(string siteId = "site-dupont", string prefixe = "dp")
    {
        var bat = new Batiment($"bat-{prefixe}-1", siteId, "Bâtiment A", [[2.0, 48.0], [2.001, 48.0], [2.001, 48.001]], [1, 1, 1], 8, 1, "manuel");
        var machine = new Machine($"m-{prefixe}-1", bat.Id, null, "flexo", "Gallus", "R01", [5, 5], 0, new ModeleRef("/kit/modeles/flexo.glb"));
        var model = Data.Model(machine);
        var organes = model.Organes.Select(o => new OrganeConfig(o.Id, o.MachineId, o.Numero, o.Nom, Position: o.Position, Methode: o.Methode)).ToList();
        var site = new Site(siteId, Org, "Usine Dupont", "Évreux", [2.0, 48.0], new Repere([2.0, 48.0], 0));
        return new ConfigurationUsine(site, [bat], [], [machine], organes, model.Points.ToList(), [], Configure: true);
    }

    private static LiveService Live(MemoryStore? store = null) =>
        new(Data, store ?? new MemoryStore(), new TestNotifier(), new TestBus(), NullLogger<LiveService>.Instance);

    [Fact]
    public void Une_configuration_complete_est_recevable()
    {
        Assert.Empty(ValidationUsine.Verifier("site-dupont", Usine(), Data.Catalogue));
    }

    [Theory]
    [InlineData("site/dupont")]
    [InlineData("site.dupont")]
    [InlineData("site+#")]
    public void Un_identifiant_d_usine_qui_casserait_un_sujet_MQTT_est_refuse(string siteId)
    {
        var c = Usine(siteId);

        Assert.Contains(ValidationUsine.Verifier(siteId, c, Data.Catalogue), e => e.Champ == "site.id");
    }

    [Fact]
    public void Des_listes_absentes_sont_signalees_une_par_une()
    {
        var c = Usine() with { Zones = null!, Points = null! };

        var erreurs = ValidationUsine.Verifier("site-dupont", c, Data.Catalogue);

        Assert.Equal(["zones", "points"], erreurs.Select(e => e.Champ));
    }

    [Fact]
    public void Un_point_rattache_a_un_organe_d_une_autre_machine_est_refuse()
    {
        var c = Usine();
        var point = c.Points[0] with { OrganeId = "m-autre.o1" };

        var erreurs = ValidationUsine.Verifier("site-dupont", c with { Points = [point, .. c.Points.Skip(1)] }, Data.Catalogue);

        Assert.Equal("points[0].organeId", Assert.Single(erreurs).Champ);
    }

    [Fact]
    public void Un_seuil_hors_bornes_et_trop_de_machines_sont_refuses()
    {
        var c = Usine();
        var point = c.Points[0] with { Seuils = new Seuils(AlarmeHaut: 1e12) };
        var machines = Enumerable.Range(0, ValidationUsine.MachinesMax + 1).Select(i => c.Machines[0] with { Id = $"m-{i}" }).ToList();

        Assert.Equal("points[0].seuils.alarmeHaut", Assert.Single(ValidationUsine.Verifier("site-dupont", c with { Points = [point, .. c.Points.Skip(1)] }, Data.Catalogue)).Champ);
        Assert.Equal("machines", Assert.Single(ValidationUsine.Verifier("site-dupont", c with { Machines = machines }, Data.Catalogue)).Champ);
    }

    [Fact]
    public void La_liste_des_refus_est_bornee()
    {
        var c = Usine();
        var points = c.Points.Select(p => p with { Libelle = "", Unite = new string('u', 50) }).ToList();

        Assert.Equal(ValidationUsine.ErreursMax, ValidationUsine.Verifier("site-dupont", c with { Points = points }, Data.Catalogue).Count);
    }

    [Fact]
    public async Task Une_usine_enregistree_est_rechargee_au_demarrage_avec_ses_alarmes()
    {
        var store = new MemoryStore();
        var c = Usine();
        await new UsinesService(store, Live(store), Data).EnregistrerAsync(Org, "site-dupont", c);
        await store.SaveAlarmAsync("site-dupont", new Alarme
        {
            Id = "al-dupont", Code = "AU-1", Message = "Arrêt d'urgence", Gravite = "critique", MachineId = "m-dp-1", OrganeId = "m-dp-1.o1",
            Horodatage = DateTimeOffset.UtcNow.AddHours(-1).ToUnixTimeMilliseconds(), Regle = "automate",
        });

        // Redémarrage : un nouveau temps réel sur la même base.
        var live = Live(store);
        Assert.Null(live.Site("site-dupont"));
        await live.RestoreAsync(CancellationToken.None);

        Assert.Equal(Org, live.OrganisationDe("site-dupont"));
        Assert.Equal("site-dupont", live.SiteDeMachine("m-dp-1"));
        Assert.Equal("site-dupont", live.SiteDePoint(c.Points[0].Id));
        Assert.Equal("al-dupont", Assert.Single(live.ActiveAlarms("site-dupont")).Id);
        Assert.Equal(["site-tours", "site-crissey", "site-dupont"], live.SiteIds);
    }

    [Fact]
    public void Les_seuils_enregistres_remplacent_ceux_du_catalogue()
    {
        var c = Usine();
        var tension = c.Points.First(p => p.Cle == "tension");
        var abaisse = tension with { Seuils = new Seuils(AlarmeHaut: tension.Nominal + 1) };
        var live = Live();
        live.Charger(new UsineEnregistree(Org, c with { Points = c.Points.Select(p => p.Id == tension.Id ? abaisse : p).ToList() }));

        live.HandleTelemetry(new TelemetryMessage { SiteId = "site-dupont", MachineId = "m-dp-1", Ts = DateTimeOffset.UtcNow, Metrics = [new Metric(tension.Id, tension.Nominal + 2)] }, DateTimeOffset.UtcNow);

        Assert.Equal("alarme", live.Direct("site-dupont")!.Valeurs[tension.Id].Niveau);
    }

    [Fact]
    public async Task Une_organisation_ne_reecrit_pas_l_usine_d_une_autre()
    {
        var store = new MemoryStore();
        var live = Live(store);
        var service = new UsinesService(store, live, Data);
        await service.EnregistrerAsync(Org, "site-dupont", Usine());

        var r = await service.EnregistrerAsync("org-intrus", "site-dupont", Usine() with { Site = Usine().Site with { Nom = "Volée" } });

        Assert.True(r.Introuvable);
        Assert.Equal("Usine Dupont", live.Site("site-dupont")!.Site.Nom);
        Assert.Equal(Org, Assert.Single(await store.UsinesAsync()).OrganisationId);
    }
}
