using System.Net;
using System.Text.Json;
using EVAN.Api.Endpoints;
using EVAN.Core.Contracts;

namespace EVAN.Api.Tests;

/// <summary>
/// Test de liaison : il part vers la passerelle de l'usine visée et d'aucune autre ; protocole, identifiants et
/// paramètres sont bornés avant que quoi que ce soit ne soit publié. Les refus sont des ProblemDetails.
/// </summary>
public class ConnectionEndpointsTests
{
    private static object Demande(string? siteId = BancUsines.Crissey, string? gatewayId = null, string machineId = BancUsines.MachineCrissey,
        string protocole = "opcua", Dictionary<string, string>? parametres = null) =>
        new { machineId, protocole, parametres = parametres ?? new() { ["endpoint"] = "opc.tcp://10.20.1.21:4840" }, siteId, gatewayId };

    private static async Task<string> Detail(HttpResponseMessage res)
    {
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
        return JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement.GetProperty("detail").GetString()!;
    }

    [Fact]
    public async Task Le_test_part_vers_la_passerelle_de_l_usine_visee()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande());

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal([Topics.GatewayCommand(BancUsines.Crissey, "crissey-01", "test")], banc.Messages.Sujets);
    }

    [Fact]
    public async Task La_passerelle_nommee_est_acceptee_si_c_est_celle_de_l_usine()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande(gatewayId: "crissey-01"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Single(banc.Messages.Sujets);
    }

    [Theory]
    [InlineData("tours-01")]
    [InlineData("crissey-02")]
    [InlineData("crissey-01/cmd/write")]
    [InlineData("+")]
    public async Task La_passerelle_d_une_autre_usine_est_refusee(string gatewayId)
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande(gatewayId: gatewayId));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("Cette passerelle n'est pas celle de l'usine visée.", await Detail(res));
        Assert.Empty(banc.Messages.Sujets);
    }

    [Theory]
    [InlineData("modbus-rtu")]
    [InlineData("OPCUA")]
    [InlineData("file")]
    [InlineData("")]
    public async Task Un_protocole_inconnu_est_refuse(string protocole)
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande(protocole: protocole));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.StartsWith("Protocole", await Detail(res));
        Assert.Empty(banc.Messages.Sujets);
    }

    [Theory]
    [InlineData("mqtt")]
    [InlineData("simulateur")]
    public async Task Un_protocole_d_evan_que_seule_la_demonstration_simule_part_vers_la_passerelle(string protocole)
    {
        // La passerelle réelle le refuse d'elle-même ; celle de la démonstration répond une liaison simulée.
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande(protocole: protocole, parametres: new() { ["cadence"] = "1000" }));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Single(banc.Messages.Sujets);
    }

    [Fact]
    public async Task Une_usine_inconnue_est_introuvable()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande(siteId: "site-ailleurs"));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Empty(banc.Messages.Sujets);
    }

    [Fact]
    public async Task Une_machine_d_une_autre_usine_est_refusee()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande(machineId: BancUsines.MachineTours));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Empty(banc.Messages.Sujets);
    }

    [Fact]
    public async Task Une_machine_en_cours_de_configuration_peut_etre_testee()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", Demande(machineId: "m-nouvelle"));

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    public static TheoryData<string, object> HorsBornes => new()
    {
        { "machine vide", Demande(machineId: "") },
        { "machine trop longue", Demande(machineId: new string('m', Bornes.Identifiant + 1)) },
        { "usine trop longue", Demande(siteId: new string('s', Bornes.Identifiant + 1)) },
        { "passerelle trop longue", Demande(gatewayId: new string('g', Bornes.Identifiant + 1)) },
        { "trop de paramètres", Demande(parametres: Enumerable.Range(0, Bornes.ParametresMax + 1).ToDictionary(i => $"p{i}", _ => "x")) },
        { "nom de paramètre trop long", Demande(parametres: new() { [new string('k', Bornes.Identifiant + 1)] = "x" }) },
        { "valeur trop longue", Demande(parametres: new() { ["endpoint"] = "opc.tcp://" + new string('a', Bornes.Parametre) }) },
    };

    [Theory]
    [MemberData(nameof(HorsBornes))]
    public async Task Une_requete_hors_bornes_est_refusee_sans_rien_publier(string cas, object demande)
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/connections/test", demande);

        Assert.True(res.StatusCode == HttpStatusCode.BadRequest, cas);
        Assert.Empty(banc.Messages.Sujets);
    }
}
