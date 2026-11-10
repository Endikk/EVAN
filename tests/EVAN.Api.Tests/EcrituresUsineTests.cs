using System.Net;

namespace EVAN.Api.Tests;

/// <summary>
/// Routes d'écriture ouvertes (journal, interventions, démonstration) : une usine inconnue est introuvable au lieu d'un
/// « accepté » qui ne fait rien, et une machine ou un organe d'ailleurs n'entre pas dans les données d'une usine.
/// </summary>
public class EcrituresUsineTests
{
    private static object Evenement(string? machineId) => new { type = "action", message = "Écriture autorisée", machineId, auteur = "Superviseur" };

    private static object Intervention(string machineId, string? organeId) => new
    {
        machineId,
        organeId,
        type = "curative",
        date = DateTimeOffset.UtcNow.AddHours(-1).ToUnixTimeMilliseconds(),
        duree = 30,
        titre = "Remplacement lame",
        auteur = "Équipe B",
    };

    [Fact]
    public async Task Un_evenement_d_une_machine_de_l_usine_est_journalise()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync($"/api/sites/{BancUsines.Crissey}/events", Evenement(BancUsines.MachineCrissey));

        Assert.Equal(HttpStatusCode.Accepted, res.StatusCode);
        Assert.Contains(banc.Live.Direct(BancUsines.Crissey)!.Evenements, e => e.MachineId == BancUsines.MachineCrissey);
    }

    [Fact]
    public async Task Un_evenement_pour_une_usine_inconnue_est_introuvable()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/sites/site-ailleurs/events", Evenement(null));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Un_evenement_qui_nomme_une_machine_d_une_autre_usine_est_refuse()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync($"/api/sites/{BancUsines.Crissey}/events", Evenement(BancUsines.MachineTours));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.DoesNotContain(banc.Live.Direct(BancUsines.Crissey)!.Evenements, e => e.MachineId == BancUsines.MachineTours);
    }

    [Fact]
    public async Task Une_intervention_sur_un_organe_de_la_machine_est_consignee()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions", Intervention(BancUsines.MachineTours, $"{BancUsines.MachineTours}.o7"));

        Assert.Equal(HttpStatusCode.Created, res.StatusCode);
    }

    [Theory]
    [InlineData("m-r02.o7")]
    [InlineData("m-cr-pp01.o1")]
    [InlineData("m-r01.o")]
    [InlineData("m-r01.oX")]
    [InlineData("m-r01.o7.tension")]
    public async Task Une_intervention_sur_l_organe_d_une_autre_machine_est_refusee(string organeId)
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions", Intervention(BancUsines.MachineTours, organeId));

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Une_intervention_pour_la_machine_d_une_autre_usine_est_introuvable()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions", Intervention(BancUsines.MachineCrissey, null));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Theory]
    [InlineData("fault")]
    [InlineData("reset")]
    public async Task La_demonstration_d_une_usine_inconnue_est_introuvable_et_ne_publie_rien(string action)
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync($"/api/demo/site-ailleurs/{action}", new { });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Empty(banc.Messages.Sujets);
    }
}
