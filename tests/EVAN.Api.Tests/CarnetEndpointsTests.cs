using System.Net;
using System.Net.Http.Json;
using EVAN.Application.Exploitation;
using Microsoft.Extensions.DependencyInjection;

namespace EVAN.Api.Tests;

/// <summary>
/// Carnet côté serveur, routes du navigateur en mode API : correction et suppression d'une saisie, interventions
/// planifiées. Validation des entrées, et une saisie ou une machine d'une autre usine reste introuvable.
/// </summary>
public class CarnetEndpointsTests
{
    private static readonly long Maintenant = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    private static object Saisie(string id, string machineId, string titre = "Remplacement lame") => new
    {
        id, machineId, organeId = (string?)null, type = "curative", date = Maintenant - 3_600_000, duree = 30, titre, auteur = "Équipe B",
    };

    private static object Prevue(string? id, string machineId, long date, double duree = 45, string? pointId = null) => new
    {
        id, machineId, organeId = $"{machineId}.o5", tacheId = "uv", titre = "Remplacer la lampe UV", date, duree, auteur = "Équipe B", pointId,
    };

    private static CarnetService Carnet(BancUsines banc) => banc.Services.GetRequiredService<CarnetService>();

    [Fact]
    public async Task Une_saisie_se_corrige_puis_se_supprime()
    {
        await using var banc = await BancUsines.DemarrerAsync();
        await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions", Saisie("sa-1", BancUsines.MachineTours));

        var put = await banc.Http.PutAsJsonAsync($"/api/sites/{BancUsines.Tours}/interventions/sa-1", Saisie("autre-id", BancUsines.MachineTours, "Lame et contre-lame"));
        Assert.Equal(HttpStatusCode.OK, put.StatusCode);
        // L'identifiant est celui de l'adresse, jamais celui du corps.
        Assert.Equal("Lame et contre-lame", Assert.Single(Carnet(banc).Saisies(BancUsines.Tours)).Titre);
        Assert.Equal("sa-1", Carnet(banc).Saisies(BancUsines.Tours)[0].Id);

        var del = await banc.Http.DeleteAsync($"/api/sites/{BancUsines.Tours}/interventions/sa-1");
        Assert.Equal(HttpStatusCode.NoContent, del.StatusCode);
        Assert.Empty(Carnet(banc).Saisies(BancUsines.Tours));
        Assert.Equal(HttpStatusCode.NotFound, (await banc.Http.DeleteAsync($"/api/sites/{BancUsines.Tours}/interventions/sa-1")).StatusCode);
    }

    [Fact]
    public async Task Une_saisie_de_Tours_est_introuvable_depuis_Crissey()
    {
        await using var banc = await BancUsines.DemarrerAsync();
        await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions", Saisie("sa-1", BancUsines.MachineTours));

        var put = await banc.Http.PutAsJsonAsync($"/api/sites/{BancUsines.Crissey}/interventions/sa-1", Saisie("sa-1", BancUsines.MachineCrissey, "Intrusion"));
        var del = await banc.Http.DeleteAsync($"/api/sites/{BancUsines.Crissey}/interventions/sa-1");
        // Corriger vers une machine d'une autre usine : la saisie ne change pas d'usine.
        var deplacee = await banc.Http.PutAsJsonAsync($"/api/sites/{BancUsines.Tours}/interventions/sa-1", Saisie("sa-1", BancUsines.MachineCrissey));

        Assert.Equal(HttpStatusCode.NotFound, put.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, del.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, deplacee.StatusCode);
        Assert.Equal("Remplacement lame", Assert.Single(Carnet(banc).Saisies(BancUsines.Tours)).Titre);
    }

    [Fact]
    public async Task Une_correction_invalide_est_refusee()
    {
        await using var banc = await BancUsines.DemarrerAsync();
        await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions", Saisie("sa-1", BancUsines.MachineTours));

        var vide = await banc.Http.PutAsJsonAsync($"/api/sites/{BancUsines.Tours}/interventions/sa-1", Saisie("sa-1", BancUsines.MachineTours, " "));
        var longue = await banc.Http.PutAsJsonAsync($"/api/sites/{BancUsines.Tours}/interventions/{new string('x', 65)}", Saisie("sa-1", BancUsines.MachineTours));

        Assert.Equal(HttpStatusCode.BadRequest, vide.StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, longue.StatusCode);
        Assert.Equal("Remplacement lame", Assert.Single(Carnet(banc).Saisies(BancUsines.Tours)).Titre);
    }

    [Fact]
    public async Task Une_intervention_se_planifie_se_deplace_et_s_annule()
    {
        await using var banc = await BancUsines.DemarrerAsync();
        var demain = Maintenant + 86_400_000;
        var url = $"/api/sites/{BancUsines.Tours}/interventions/prevues";

        var creee = await banc.PostAsync(url, Prevue("pv-1", BancUsines.MachineTours, demain, pointId: $"{BancUsines.MachineTours}.o5.puissance_uv"));
        var deplacee = await banc.PostAsync(url, Prevue("pv-1", BancUsines.MachineTours, demain + 7_200_000));
        var liste = await banc.Http.GetFromJsonAsync<List<Dictionary<string, object>>>(url);

        Assert.Equal(HttpStatusCode.Created, creee.StatusCode);
        Assert.Equal(HttpStatusCode.Created, deplacee.StatusCode);
        Assert.Equal(demain + 7_200_000, Assert.Single(Carnet(banc).Prevues(BancUsines.Tours)).Date);
        Assert.Single(liste!);
        Assert.Equal(HttpStatusCode.NotFound, (await banc.Http.DeleteAsync($"/api/sites/{BancUsines.Crissey}/interventions/prevues/pv-1")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await banc.Http.DeleteAsync($"{url}/pv-1")).StatusCode);
        Assert.Empty(Carnet(banc).Prevues(BancUsines.Tours));
    }

    [Theory]
    [InlineData(0, null, "date ok, durée nulle")]
    [InlineData(45, "m-cr-pp01.o1.tension", "point d'une autre machine")]
    [InlineData(45, null, "date trop lointaine")]
    public async Task Une_planification_invalide_est_refusee(double duree, string? pointId, string cas)
    {
        await using var banc = await BancUsines.DemarrerAsync();
        var date = cas == "date trop lointaine" ? Maintenant + 500L * 86_400_000 : Maintenant + 86_400_000;

        var res = await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions/prevues", Prevue("pv-1", BancUsines.MachineTours, date, duree, pointId));

        Assert.True(res.StatusCode == HttpStatusCode.BadRequest, cas);
        Assert.Empty(Carnet(banc).Prevues(BancUsines.Tours));
    }

    [Fact]
    public async Task Planifier_sur_la_machine_d_une_autre_usine_est_introuvable()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync($"/api/sites/{BancUsines.Tours}/interventions/prevues", Prevue(null, BancUsines.MachineCrissey, Maintenant + 86_400_000));

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Empty(Carnet(banc).Prevues(BancUsines.Tours));
    }
}
