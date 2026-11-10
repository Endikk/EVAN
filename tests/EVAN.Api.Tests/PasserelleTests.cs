using System.Net;
using System.Text.Json;
using EVAN.Application.Usines;
using EVAN.Core.Domain.Machines;

namespace EVAN.Api.Tests;

/// <summary>
/// Configuration de la passerelle d'une usine : appsettings.json prêt pour EVAN.Gateway, construit depuis les
/// connexions de l'étape 5, réservé aux administrateurs de l'organisation.
/// </summary>
public class PasserelleTests
{
    private static Connexion Connexion(string protocole, Dictionary<string, string> parametres, Dictionary<string, string>? associations = null) =>
        new("cx-1", "m-1", protocole, parametres, "connectee", associations ?? [], true);

    [Fact]
    public async Task L_administrateur_recoit_un_fichier_pret_pour_la_passerelle()
    {
        await using var banc = await BancApi.Demarrer(new() { ["Evan:Passerelles:Broker"] = "mqtt.evan.example" });
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        var config = UsineExemple.Creer(banc.Data, "site-dupont", "dp");
        await admin.Put("/api/sites/site-dupont", config);

        var fichier = await admin.Json("/api/sites/site-dupont/passerelle/config");
        var gateway = fichier.GetProperty("Gateway");
        var connexion = gateway.GetProperty("Connections").EnumerateArray().Single();
        var variable = connexion.GetProperty("Points").EnumerateArray().Single();
        var mqtt = fichier.GetProperty("Evan").GetProperty("Mqtt");

        Assert.Equal("site-dupont", gateway.GetProperty("SiteId").GetString());
        Assert.Equal("gw-dupont", gateway.GetProperty("GatewayId").GetString());
        Assert.False(gateway.GetProperty("AllowWrites").GetBoolean());
        Assert.Equal(["10.20.1.21"], gateway.GetProperty("AllowedTestTargets").EnumerateArray().Select(h => h.GetString()));
        Assert.Equal("m-dp-1", connexion.GetProperty("MachineId").GetString());
        Assert.Equal("opcua", connexion.GetProperty("Protocol").GetString());
        Assert.Equal("opc.tcp://10.20.1.21:4840", connexion.GetProperty("Parameters").GetProperty("endpoint").GetString());
        Assert.Equal(config.Connexions[0].Associations.Single().Value, variable.GetProperty("PointId").GetString());
        Assert.Equal("ns=2;s=R01.Tension", variable.GetProperty("Address").GetString());
        Assert.Equal("mqtt.evan.example", mqtt.GetProperty("Host").GetString());
        Assert.Equal("certs/gw-dupont.crt", mqtt.GetProperty("CertFile").GetString());
    }

    [Fact]
    public async Task Un_membre_ne_recoit_pas_la_configuration_de_la_passerelle()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        await admin.Put("/api/sites/site-dupont", UsineExemple.Creer(banc.Data, "site-dupont", "dp"));
        await admin.Post("/api/organisation/membres", new { identifiant = "paul@dupont.fr", nom = "Paul", motDePasse = BancApi.MotDePasse });
        var membre = await banc.Navigateur().Connecter("paul@dupont.fr");

        Assert.Equal(HttpStatusCode.Forbidden, (await membre.Get("/api/sites/site-dupont/passerelle/config")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await membre.Get("/api/sites/site-dupont")).StatusCode);
    }

    [Fact]
    public async Task Sans_broker_configure_le_fichier_laisse_l_hote_a_renseigner()
    {
        await using var banc = await BancApi.Demarrer();
        var admin = await banc.Organisation("Imprimerie Dupont", "admin@dupont.fr");
        await admin.Put("/api/sites/site-dupont", UsineExemple.Creer(banc.Data, "site-dupont", "dp"));

        var mqtt = (await admin.Json("/api/sites/site-dupont/passerelle/config")).GetProperty("Evan").GetProperty("Mqtt");

        Assert.False(mqtt.TryGetProperty("Host", out _));
    }

    [Fact]
    public void Les_adresses_sont_celles_que_lit_chaque_source_de_la_passerelle()
    {
        Assert.Equal("HR 40101 float32", ConfigurationPasserelle.Adresse("modbus", "HR 40101 (float32)"));
        Assert.Equal("Speed", ConfigurationPasserelle.Adresse("jmf", "JMF/Status/Speed"));
        Assert.Equal("DB10.DBD4", ConfigurationPasserelle.Adresse("s7", "DB10.DBD4"));
        Assert.Equal("ns=2;s=R01.Groupe.Tension", ConfigurationPasserelle.Adresse("opcua", "ns=2;s=R01.Groupe.Tension"));
    }

    [Fact]
    public void Les_hotes_joignables_viennent_des_parametres_de_chaque_protocole()
    {
        Assert.Equal("10.20.1.21", ConfigurationPasserelle.Hote(Connexion("opcua", new() { ["endpoint"] = "opc.tcp://10.20.1.21:4840" })));
        Assert.Equal("presse.usine.local", ConfigurationPasserelle.Hote(Connexion("jmf", new() { ["url"] = "http://presse.usine.local:8080/jmf" })));
        Assert.Equal("10.20.1.40", ConfigurationPasserelle.Hote(Connexion("modbus", new() { ["hote"] = " 10.20.1.40 " })));
        Assert.Null(ConfigurationPasserelle.Hote(Connexion("opcua", new() { ["endpoint"] = "pas une adresse" })));
    }

    [Fact]
    public void Les_capteurs_MQTT_et_le_simulateur_ne_passent_pas_par_la_passerelle()
    {
        var site = new Core.Domain.Sites.Site("site-x", "org-x", "Usine", "", [2, 48], new([2, 48], 0), Passerelle: "gw-x");
        var machine = new Machine("m-1", "bat-1", null, "flexo", "Gallus", "R01", [0, 0], 0, new("/kit/modeles/flexo.glb"));
        var config = new ConfigurationUsine(site, [], [], [machine], [], [], [Connexion("mqtt", new() { ["broker"] = "mqtts://capteurs:8883" })]);

        var fichier = ConfigurationPasserelle.Construire(config, null);

        Assert.Empty(fichier.Gateway.Connections);
        Assert.Empty(fichier.Gateway.AllowedTestTargets);
        Assert.DoesNotContain("motDePasse", JsonSerializer.Serialize(fichier));
    }
}
