using System.Net;
using System.Net.Sockets;
using System.Text;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using EVAN.Gateway.Security;
using EVAN.Gateway.Sources;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Gateway.Tests;

/// <summary>
/// Garde des tests de liaison : un test ne joint que l'hôte d'une connexion déclarée ou une cible de
/// Gateway:AllowedTestTargets (nom exact, adresse, plage CIDR). Tout le reste est refusé avant la moindre connexion,
/// et un nom résolu n'est joint qu'à l'adresse vérifiée.
/// </summary>
public class GardeTestLiaisonTests
{
    /// <summary>DNS simulé : un nom inconnu lève comme le vrai résolveur ; chaque appel est compté.</summary>
    private sealed class DnsSimule(Dictionary<string, IPAddress[]> noms)
    {
        public int Appels;

        public Task<IPAddress[]> Resoudre(string nom, CancellationToken ct)
        {
            Interlocked.Increment(ref Appels);
            return noms.TryGetValue(nom, out var a) ? Task.FromResult(a) : Task.FromException<IPAddress[]>(new SocketException((int)SocketError.HostNotFound));
        }
    }

    /// <summary>Source qui compte ses tests et ne joint rien.</summary>
    private sealed class SourceEspion : IMachineSource
    {
        public int Tests;
        public IPAddress? Adresse;

        public Task RunAsync(MachineConnection connection, ISampleSink sink, CancellationToken ct) => Task.CompletedTask;

        public Task<ConnectionTestReply> TestAsync(ConnectionTestRequest request, IPAddress? adresse, CancellationToken ct)
        {
            Tests++;
            Adresse = adresse;
            return Task.FromResult(new ConnectionTestReply { RequestId = request.RequestId, Ok = true });
        }
    }

    private static readonly DnsSimule Vide = new([]);

    private static GardeTestLiaison Garde(string[]? autorisees = null, DnsSimule? dns = null, MachineConnection[]? connexions = null)
    {
        var options = new GatewayOptions { AllowedTestTargets = autorisees ?? [], Connections = (connexions ?? []).ToList() };
        return new GardeTestLiaison(options, NullLogger<GardeTestLiaison>.Instance, (dns ?? Vide).Resoudre);
    }

    private static MachineConnection Declaree(string protocole, string cle, string valeur) =>
        new() { MachineId = "m-pv01", Protocol = protocole, Parameters = new() { [cle] = valeur } };

    private static ConnectionTestRequest Demande(string protocole, params (string Cle, string Valeur)[] parametres) => new()
    {
        RequestId = "rq-test",
        MachineId = "m-r01",
        Protocole = protocole,
        Parametres = parametres.ToDictionary(p => p.Cle, p => p.Valeur),
    };

    private static ConnectionTestRequest Modbus(string hote, int port = 502) => Demande("modbus", ("hote", hote), ("port", port.ToString()));
    private static ConnectionTestRequest OpcUa(string endpoint) => Demande("opcua", ("endpoint", endpoint));

    [Fact]
    public async Task L_hote_d_une_connexion_declaree_est_accepte_et_joint_par_son_nom()
    {
        var dns = new DnsSimule([]);
        var garde = Garde(dns: dns, connexions: [Declaree("opcua", "endpoint", "opc.tcp://opcplc:50000")]);

        var decision = await garde.EvaluerAsync(OpcUa("opc.tcp://opcplc:50000/"), CancellationToken.None);

        Assert.Equal(new CibleTest("opcplc", null), decision.Cible);
        Assert.Equal(0, dns.Appels);
    }

    [Fact]
    public async Task L_hote_declare_reste_accepte_sur_un_autre_protocole_et_sans_tenir_compte_de_la_casse()
    {
        var garde = Garde(connexions: [Declaree("modbus", "hote", "10.20.1.40")]);

        Assert.NotNull((await garde.EvaluerAsync(Modbus("10.20.1.40", 503), CancellationToken.None)).Cible);
        Assert.NotNull((await Garde(connexions: [Declaree("opcua", "endpoint", "opc.tcp://OpcPlc:50000")])
            .EvaluerAsync(Demande("s7", ("hote", "opcplc")), CancellationToken.None)).Cible);
    }

    [Theory]
    [InlineData("modbus", "hote", "10.20.1.40")]
    [InlineData("s7", "hote", "10.20.1.50")]
    [InlineData("opcua", "endpoint", "opc.tcp://10.20.1.21:4840")]
    [InlineData("jmf", "url", "http://10.20.1.11:8080/jmf")]
    [InlineData("opcua", "endpoint", "opc.tcp://automate.atelier:4840")]
    public async Task Sans_connexion_declaree_ni_liste_tout_test_est_refuse(string protocole, string cle, string valeur)
    {
        var decision = await Garde().EvaluerAsync(Demande(protocole, (cle, valeur)), CancellationToken.None);

        Assert.Null(decision.Cible);
        Assert.Equal(GardeTestLiaison.HorsListe, decision.Etape);
    }

    [Fact]
    public async Task Sans_hote_la_cible_est_celle_que_la_source_prendrait_par_defaut()
    {
        Assert.Null((await Garde().EvaluerAsync(Demande("modbus"), CancellationToken.None)).Cible);
        Assert.Equal(new CibleTest("127.0.0.1", IPAddress.Loopback), (await Garde(["127.0.0.1"]).EvaluerAsync(Demande("modbus"), CancellationToken.None)).Cible);
        Assert.Equal("localhost", (await Garde(["localhost"]).EvaluerAsync(Demande("opcua"), CancellationToken.None)).Cible?.Hote);
    }

    [Fact]
    public async Task Une_cible_hors_liste_est_refusee_sans_qu_aucune_connexion_soit_ouverte()
    {
        using var automate = new TcpListener(IPAddress.Loopback, 0);
        automate.Start();
        var port = ((IPEndPoint)automate.LocalEndpoint).Port;
        var sources = 0;
        IMachineSource Source(string p)
        {
            sources++;
            return new ModbusSource(NullLogger.Instance);
        }

        var reponse = await GatewayWorker.TesterAsync(Modbus("127.0.0.1", port), Garde(["10.20.0.0/16"]), Source, CancellationToken.None);

        Assert.False(reponse.Ok);
        Assert.Equal([new TestStep(GardeTestLiaison.HorsListe, false)], reponse.Steps);
        Assert.Equal(0, sources);
        Assert.False(automate.Pending());
    }

    [Theory]
    [InlineData("10.20.1.40", true)]
    [InlineData("10.20.255.255", true)]
    [InlineData("10.21.0.1", false)]
    [InlineData("192.168.1.10", false)]
    [InlineData("::ffff:10.20.1.40", true)]
    public async Task Une_plage_cidr_ipv4_borne_les_adresses_acceptees(string hote, bool acceptee)
    {
        var decision = await Garde(["10.20.0.0/16"]).EvaluerAsync(Modbus(hote), CancellationToken.None);

        Assert.Equal(acceptee, decision.Cible is not null);
        if (acceptee) Assert.Equal(IPAddress.Parse(hote).MapToIPv4(), decision.Cible!.Adresse);
    }

    [Theory]
    [InlineData("opc.tcp://[fd00:20::5]:4840", true)]
    [InlineData("opc.tcp://[fd00:20::ffff:1]:4840", true)]
    [InlineData("opc.tcp://[fd00:21::5]:4840", false)]
    [InlineData("opc.tcp://10.20.1.21:4840", false)]
    public async Task Une_plage_cidr_ipv6_borne_les_adresses_acceptees(string endpoint, bool acceptee)
    {
        var decision = await Garde(["fd00:20::/64"]).EvaluerAsync(OpcUa(endpoint), CancellationToken.None);

        Assert.Equal(acceptee, decision.Cible is not null);
    }

    [Fact]
    public async Task Un_nom_resolu_hors_de_la_plage_est_refuse()
    {
        var dns = new DnsSimule(new() { ["presse.atelier"] = [IPAddress.Parse("192.168.1.10")] });

        var decision = await Garde(["10.20.0.0/16"], dns).EvaluerAsync(Demande("jmf", ("url", "http://presse.atelier:8080/jmf")), CancellationToken.None);

        Assert.Null(decision.Cible);
        Assert.Equal(GardeTestLiaison.HorsListe, decision.Etape);
        Assert.Equal(1, dns.Appels);
    }

    [Fact]
    public async Task Un_nom_dont_une_seule_adresse_sort_de_la_plage_est_refuse()
    {
        var dns = new DnsSimule(new() { ["automate.atelier"] = [IPAddress.Parse("10.20.1.21"), IPAddress.Parse("192.168.1.10")] });

        var decision = await Garde(["10.20.0.0/16"], dns).EvaluerAsync(OpcUa("opc.tcp://automate.atelier:4840"), CancellationToken.None);

        Assert.Null(decision.Cible);
    }

    [Fact]
    public async Task Un_nom_resolu_dans_la_plage_est_joint_a_l_adresse_verifiee()
    {
        var dns = new DnsSimule(new() { ["automate.atelier"] = [IPAddress.Parse("10.20.1.21")] });

        var decision = await Garde(["10.20.0.0/16"], dns).EvaluerAsync(OpcUa("opc.tcp://automate.atelier:4840"), CancellationToken.None);

        Assert.Equal(new CibleTest("automate.atelier", IPAddress.Parse("10.20.1.21")), decision.Cible);
    }

    [Fact]
    public async Task Un_nom_introuvable_est_refuse_avec_la_meme_etape_qu_une_adresse_hors_liste()
    {
        var decision = await Garde(["10.20.0.0/16"]).EvaluerAsync(OpcUa("opc.tcp://inconnu.atelier:4840"), CancellationToken.None);

        Assert.Null(decision.Cible);
        Assert.Equal(GardeTestLiaison.HorsListe, decision.Etape);
    }

    [Fact]
    public async Task Un_nom_de_la_liste_est_accepte_tel_quel_sans_resolution()
    {
        var dns = new DnsSimule([]);

        var decision = await Garde(["Presse-Gallus.atelier"], dns).EvaluerAsync(Demande("jmf", ("url", "https://presse-gallus.atelier/jmf")), CancellationToken.None);

        Assert.Equal(new CibleTest("presse-gallus.atelier", null), decision.Cible);
        Assert.Equal(0, dns.Appels);
    }

    [Theory]
    [InlineData("opcua", "endpoint", "http://10.20.1.21:4840")]
    [InlineData("opcua", "endpoint", "pas une adresse")]
    [InlineData("jmf", "url", "file:///etc/passwd")]
    [InlineData("jmf", "url", "ftp://10.20.1.11/jmf")]
    [InlineData("modbus", "hote", "10.20.1.40\nfaux journal")]
    [InlineData("s7", "hote", "10.20.1.50:102")]
    public async Task Une_adresse_illisible_pour_le_protocole_est_refusee(string protocole, string cle, string valeur)
    {
        var decision = await Garde(["10.0.0.0/8"]).EvaluerAsync(Demande(protocole, (cle, valeur)), CancellationToken.None);

        Assert.Null(decision.Cible);
        Assert.Equal(GardeTestLiaison.AdresseIllisible, decision.Etape);
    }

    [Fact]
    public void Chaque_protocole_testable_a_une_cible_par_defaut_comme_sa_source()
    {
        Assert.All(GardeTestLiaison.Protocoles, p => Assert.NotNull(GardeTestLiaison.Hote(p, [])));
    }

    [Fact]
    public async Task Un_protocole_inconnu_est_refuse()
    {
        var decision = await Garde(["0.0.0.0/0"]).EvaluerAsync(Demande("mqtt", ("broker", "mqtts://10.20.1.5:8883")), CancellationToken.None);

        Assert.Equal(new DecisionTest(null, GardeTestLiaison.ProtocoleInconnu), decision);
    }

    [Fact]
    public async Task Une_entree_illisible_de_la_liste_n_autorise_rien()
    {
        var garde = Garde(["10.20.0.0/33", "10.20.0.0/", "fd00::/129", "nom avec espace", "10.20.0.0/abc"]);

        Assert.Null((await garde.EvaluerAsync(Modbus("10.20.1.40"), CancellationToken.None)).Cible);
        Assert.Null((await garde.EvaluerAsync(OpcUa("opc.tcp://[fd00::1]:4840"), CancellationToken.None)).Cible);
    }

    [Theory]
    [InlineData("10.0.0.0/8", "10.255.255.255", true)]
    [InlineData("10.0.0.0/8", "11.0.0.0", false)]
    [InlineData("10.20.1.40", "10.20.1.40", true)]
    [InlineData("10.20.1.40", "10.20.1.41", false)]
    [InlineData("10.20.1.0/25", "10.20.1.127", true)]
    [InlineData("10.20.1.0/25", "10.20.1.128", false)]
    [InlineData("0.0.0.0/0", "203.0.113.9", true)]
    [InlineData("0.0.0.0/0", "::1", false)]
    [InlineData("::ffff:10.20.0.0/112", "10.20.3.4", true)]
    [InlineData("fd00:20::/64", "fd00:20::1", true)]
    [InlineData("fd00:20::/31", "fd00:21::1", true)]
    [InlineData("fd00:20::/32", "fd00:21::1", false)]
    public void Une_plage_contient_exactement_les_adresses_de_son_prefixe(string plage, string adresse, bool contenue)
    {
        Assert.True(GardeTestLiaison.Plage.TryParse(plage, out var p));
        var a = IPAddress.Parse(adresse);

        Assert.Equal(contenue, p.Contient(a.IsIPv4MappedToIPv6 ? a.MapToIPv4() : a));
    }

    [Fact]
    public async Task Modbus_joint_l_adresse_verifiee_et_non_le_nom_demande()
    {
        using var automate = new TcpListener(IPAddress.Loopback, 0);
        automate.Start();
        var port = ((IPEndPoint)automate.LocalEndpoint).Port;
        // L'automate simulé accepte la connexion puis raccroche : la lecture échoue, la connexion a bien eu lieu.
        var accepte = Task.Run(async () =>
        {
            using var client = await automate.AcceptTcpClientAsync();
            return true;
        });
        var dns = new DnsSimule(new() { ["automate.atelier"] = [IPAddress.Loopback] });

        var reponse = await GatewayWorker.TesterAsync(Modbus("automate.atelier", port), Garde(["127.0.0.0/8"], dns), _ => new ModbusSource(NullLogger.Instance), CancellationToken.None);

        Assert.True(await accepte.WaitAsync(TimeSpan.FromSeconds(5)));
        Assert.True(reponse.Steps[0].Ok, reponse.Steps[0].Label);
    }

    [Fact]
    public async Task Jmf_joint_l_adresse_verifiee_en_gardant_le_nom_dans_la_requete()
    {
        using var presse = new TcpListener(IPAddress.Loopback, 0);
        presse.Start();
        var port = ((IPEndPoint)presse.LocalEndpoint).Port;
        var requete = Task.Run(() => RepondreJmfAsync(presse));
        var dns = new DnsSimule(new() { ["presse.atelier"] = [IPAddress.Loopback] });

        var reponse = await GatewayWorker.TesterAsync(Demande("jmf", ("url", $"http://presse.atelier:{port}/jmf")), Garde(["127.0.0.1"], dns),
            _ => new JmfSource(new HttpClient(), NullLogger.Instance), CancellationToken.None);

        Assert.True(reponse.Ok, string.Join(" / ", reponse.Steps.Select(s => s.Label)));
        Assert.Contains($"Host: presse.atelier:{port}", await requete.WaitAsync(TimeSpan.FromSeconds(5)));
    }

    [Fact]
    public async Task Une_reponse_jmf_avec_dtd_est_refusee_sans_etre_interpretee()
    {
        using var presse = new TcpListener(IPAddress.Loopback, 0);
        presse.Start();
        var port = ((IPEndPoint)presse.LocalEndpoint).Port;
        // Entités en chaîne : interprétées, elles gonfleraient la réponse en mémoire.
        const string piege = """<?xml version="1.0"?><!DOCTYPE JMF [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><JMF xmlns="http://www.CIP4.org/JDFSchema_1_1"><Response><DeviceInfo DeviceStatus="&b;"/></Response></JMF>""";
        _ = Task.Run(() => RepondreJmfAsync(presse, piege));

        var reponse = await GatewayWorker.TesterAsync(Demande("jmf", ("url", $"http://127.0.0.1:{port}/jmf")), Garde(["127.0.0.1"], new DnsSimule(new())),
            _ => new JmfSource(new HttpClient(), NullLogger.Instance), CancellationToken.None);

        Assert.False(reponse.Ok);
        Assert.Contains(reponse.Steps, s => !s.Ok && s.Label.Contains("DTD", StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Presse JMF minimale : lit la requête, répond un DeviceInfo, raccroche. Renvoie les en-têtes reçus.</summary>
    private static async Task<string> RepondreJmfAsync(TcpListener presse, string? corpsReponse = null)
    {
        using var client = await presse.AcceptTcpClientAsync();
        var flux = client.GetStream();
        var recu = new StringBuilder();
        var tampon = new byte[8192];
        while (!recu.ToString().Contains("</JMF>"))
        {
            var n = await flux.ReadAsync(tampon);
            if (n == 0) break;
            recu.Append(Encoding.UTF8.GetString(tampon, 0, n));
        }
        var corps = corpsReponse ?? """<JMF xmlns="http://www.CIP4.org/JDFSchema_1_1"><Response><DeviceInfo DeviceStatus="Running" Speed="120"/></Response></JMF>""";
        var reponse = $"HTTP/1.1 200 OK\r\nContent-Type: application/vnd.cip4-jmf+xml\r\nContent-Length: {Encoding.UTF8.GetByteCount(corps)}\r\nConnection: close\r\n\r\n{corps}";
        await flux.WriteAsync(Encoding.UTF8.GetBytes(reponse));
        return recu.ToString();
    }

    [Fact]
    public async Task Une_cible_acceptee_est_testee_par_sa_source_avec_l_adresse_verifiee()
    {
        var espion = new SourceEspion();

        var reponse = await GatewayWorker.TesterAsync(Modbus("10.20.1.40"), Garde(["10.20.0.0/16"]), _ => espion, CancellationToken.None);

        Assert.True(reponse.Ok);
        Assert.Equal(1, espion.Tests);
        Assert.Equal(IPAddress.Parse("10.20.1.40"), espion.Adresse);
    }

    [Fact]
    public void Le_point_d_acces_annonce_par_le_serveur_est_ramene_sur_l_hote_demande()
    {
        Assert.Equal("opc.tcp://10.20.1.21:4840/UA/Serveur", OpcUaSource.MemeHote("opc.tcp://autre-machine:4841/UA/Serveur", new Uri("opc.tcp://10.20.1.21:4840")));
        Assert.Throws<InvalidOperationException>(() => OpcUaSource.MemeHote("opc.https://autre-machine/UA", new Uri("opc.tcp://10.20.1.21:4840")));
    }

    [Fact]
    public void L_adresse_d_un_test_opc_ua_porte_l_adresse_verifiee()
    {
        var p = new Dictionary<string, string> { ["endpoint"] = "opc.tcp://automate.atelier:4840/UA" };

        Assert.Equal("opc.tcp://automate.atelier:4840/UA", OpcUaSource.UrlDeTest(p, null));
        Assert.Equal("opc.tcp://10.20.1.21:4840/UA", OpcUaSource.UrlDeTest(p, IPAddress.Parse("10.20.1.21")));
        Assert.Equal("opc.tcp://[fd00:20::5]:4840/UA", OpcUaSource.UrlDeTest(p, IPAddress.Parse("fd00:20::5")));
    }
}
