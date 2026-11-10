using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using EVAN.Application.Usines;
using EVAN.Core.Contracts;

namespace EVAN.Api.Tests;

/// <summary>
/// Configuration d'une usine côté serveur : enregistrement par un compte de l'organisation, validation stricte avec le
/// champ en cause, identifiants uniques dans toute l'installation, relecture, et rechargement du temps réel sans
/// redémarrage.
/// </summary>
public class UsinesTests
{
    private static async Task<string[]> Champs(HttpResponseMessage res) =>
        (await res.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("champs").EnumerateArray().Select(c => c.GetProperty("champ").GetString()!).ToArray();

    [Fact]
    public async Task Sans_compte_on_n_enregistre_aucune_usine()
    {
        await using var banc = await BancApi.Demarrer();
        var res = await banc.Navigateur().Put("/api/sites/site-dupont", UsineExemple.Creer(banc.Data, "site-dupont", "dp"));

        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.Null(banc.Live.Site("site-dupont"));
    }

    [Fact]
    public async Task Une_usine_enregistree_se_relit_et_appartient_a_l_organisation_du_compte()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var config = UsineExemple.Creer(banc.Data, "site-dupont", "dp");

        var res = await admin.Put("/api/sites/site-dupont", config);
        var relue = await (await admin.Get("/api/sites/site-dupont")).Content.ReadFromJsonAsync<ConfigurationUsine>(Json.Options);
        var organisation = await admin.Json("/api/organisation");

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.NotNull(relue);
        Assert.Equal(await BancApi.OrganisationDe(admin), relue.Site.OrganisationId);
        Assert.Equal(config.Machines.Select(m => m.Id), relue.Machines.Select(m => m.Id));
        Assert.Equal(config.Points.Count, relue.Points.Count);
        Assert.Equal(config.Organes[0].Capteurs, relue.Organes[0].Capteurs);
        Assert.Equal("gw-dupont", relue.Site.Passerelle);
        Assert.True(relue.Configure);
        Assert.Equal(["site-dupont"], organisation.GetProperty("sites").EnumerateArray().Select(s => s.GetProperty("id").GetString()));
        Assert.Equal("Imprimerie Dupont", organisation.GetProperty("organisation").GetProperty("nom").GetString());
    }

    [Fact]
    public async Task L_ingestion_reconnait_les_machines_enregistrees_sans_redemarrage()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var config = UsineExemple.Creer(banc.Data, "site-dupont", "dp", machines: 2);
        await admin.Put("/api/sites/site-dupont", config);
        var point = config.Points.First(p => p.MachineId == "m-dp-2");
        TelemetryMessage Mesure(double v) => new() { SiteId = "site-dupont", MachineId = "m-dp-2", Ts = DateTimeOffset.UtcNow, Metrics = [new Metric(point.Id, v)] };

        banc.Live.HandleTelemetry(Mesure(point.Nominal), DateTimeOffset.UtcNow);
        Assert.True(banc.Live.Direct("site-dupont")!.Valeurs.ContainsKey(point.Id));

        // Nouvelle configuration sans la seconde machine : ses mesures ne sont plus reçues.
        var reduite = config with { Machines = [config.Machines[0]], Organes = config.Organes.Where(o => o.MachineId == "m-dp-1").ToList(), Points = config.Points.Where(p => p.MachineId == "m-dp-1").ToList() };
        Assert.Equal(HttpStatusCode.OK, (await admin.Put("/api/sites/site-dupont", reduite)).StatusCode);
        banc.Live.HandleTelemetry(Mesure(point.Nominal), DateTimeOffset.UtcNow);

        var direct = banc.Live.Direct("site-dupont")!;
        Assert.False(direct.Valeurs.ContainsKey(point.Id));
        Assert.Equal(["m-dp-1"], direct.Machines.Keys);
    }

    [Fact]
    public async Task Une_configuration_invalide_est_refusee_en_nommant_chaque_champ()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var config = UsineExemple.Creer(banc.Data, "site-dupont", "dp");
        var invalide = config with
        {
            Site = config.Site with { Coordonnees = [200, 48] },
            Machines = [config.Machines[0] with { Nom = "", ZoneId = "zone-inconnue" }, config.Machines[1] with { Modele = new("https://ailleurs.example/piege.glb") }],
            Connexions = [config.Connexions[0] with { Parametres = new() { ["endpoint"] = "opc.tcp://10.0.0.1:4840", ["motDePasse"] = "secret" } }],
        };

        var res = await admin.Put("/api/sites/site-dupont", invalide);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(["site.coordonnees", "machines[0].zoneId", "machines[0].nom", "machines[1].modele.url", "connexions[0].parametres.motDePasse"], await Champs(res));
        Assert.Null(banc.Live.Site("site-dupont"));
    }

    [Fact]
    public async Task Un_identifiant_d_une_autre_usine_est_refuse_sans_la_nommer()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var config = UsineExemple.Creer(banc.Data, "site-dupont", "dp");
        // m-r01 est une machine de la démo (Tours).
        var machine = config.Machines[0];
        var reprise = config with
        {
            Machines = [machine with { Id = "m-r01" }, config.Machines[1]],
            Organes = config.Organes.Where(o => o.MachineId != machine.Id).ToList(),
            Points = config.Points.Where(p => p.MachineId != machine.Id).ToList(),
            Connexions = [],
        };

        var res = await admin.Put("/api/sites/site-dupont", reprise);
        var corps = await res.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Contains("machines[0].id", corps);
        Assert.Contains("une autre usine", corps);
        Assert.DoesNotContain("Tours", corps);
    }

    [Fact]
    public async Task Une_usine_de_la_demo_ne_se_reecrit_pas()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");

        var res = await admin.Put("/api/sites/site-tours", UsineExemple.Creer(banc.Data, "site-tours", "dp"));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal(banc.Data.Demo.Organisation.Id, banc.Live.OrganisationDe("site-tours"));
    }

    [Fact]
    public async Task La_configuration_d_une_usine_de_la_demo_se_lit_sans_compte()
    {
        await using var banc = await BancApi.Demarrer();
        var config = await (await banc.Navigateur().Get("/api/sites/site-tours")).Content.ReadFromJsonAsync<ConfigurationUsine>(Json.Options);

        Assert.NotNull(config);
        Assert.Equal(14, config.Machines.Count);
        Assert.NotEmpty(config.Organes);
        Assert.All(config.Points, p => Assert.StartsWith(p.MachineId + ".o", p.Id));
    }

    [Fact]
    public async Task Connecte_l_acquittement_et_le_journal_portent_le_nom_du_compte()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var config = UsineExemple.Creer(banc.Data, "site-dupont", "dp");
        await admin.Put("/api/sites/site-dupont", config);
        var alarme = UsineExemple.Alarme(banc.Live, "site-dupont", "m-dp-1");

        await admin.Post($"/api/alarms/{alarme}/ack");
        await admin.Post("/api/sites/site-dupont/events", new { type = "action", message = "Réglage du sécheur", auteur = "Quelqu'un d'autre" });

        var direct = banc.Live.Direct("site-dupont")!;
        Assert.Equal("Admin Imprimerie Dupont", direct.Alarmes.Single(a => a.Id == alarme).AcquitteePar);
        Assert.Contains(direct.Evenements, e => e.Message == "Réglage du sécheur" && e.Auteur == "Admin Imprimerie Dupont");
    }

    [Fact]
    public async Task Une_configuration_de_plusieurs_centaines_de_points_passe_la_limite_des_autres_routes()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var config = UsineExemple.Creer(banc.Data, "site-dupont", "dp", machines: 20);

        var res = await admin.Put("/api/sites/site-dupont", config);

        Assert.True(JsonSerializer.SerializeToUtf8Bytes(config, Json.Options).Length > 64 * 1024);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }
}
