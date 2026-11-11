using System.Net;

namespace EVAN.Api.Tests;

/// <summary>
/// POST /api/alarms/{id}/reopen : « Annuler » juste après « Intervention terminée ». Mêmes droits que la clôture, et en
/// plus seule l'organisation qui vient de clore peut annuler (la démo sans compte compte pour une organisation).
/// </summary>
public class ReouvertureAlarmeTests
{
    [Fact]
    public async Task Sans_compte_sur_la_demo_une_cloture_faite_a_l_instant_s_annule_une_fois()
    {
        await using var banc = await BancUsines.DemarrerAsync();
        var id = UsineExemple.Alarme(banc.Live, BancUsines.Tours, BancUsines.MachineTours);
        Assert.Equal(HttpStatusCode.OK, (await banc.PostAsync($"/api/alarms/{id}/resolve", new { })).StatusCode);

        var res = await banc.PostAsync($"/api/alarms/{id}/reopen", new { });

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal("active", banc.Live.Direct(BancUsines.Tours)!.Alarmes.Single(a => a.Id == id).Statut);
        // Déjà annulée : la seconde demande est refusée sans rien changer.
        Assert.Equal(HttpStatusCode.Conflict, (await banc.PostAsync($"/api/alarms/{id}/reopen", new { })).StatusCode);
    }

    [Fact]
    public async Task Une_alarme_qui_n_a_pas_ete_close_ne_se_rouvre_pas()
    {
        await using var banc = await BancUsines.DemarrerAsync();
        var id = UsineExemple.Alarme(banc.Live, BancUsines.Tours, BancUsines.MachineTours);

        var res = await banc.PostAsync($"/api/alarms/{id}/reopen", new { });

        Assert.Equal(HttpStatusCode.Conflict, res.StatusCode);
        Assert.Equal("active", banc.Live.Direct(BancUsines.Tours)!.Alarmes.Single(a => a.Id == id).Statut);
    }

    [Fact]
    public async Task Une_alarme_inconnue_est_introuvable()
    {
        await using var banc = await BancUsines.DemarrerAsync();

        var res = await banc.PostAsync("/api/alarms/al-inconnue/reopen", new { });

        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
    }

    [Fact]
    public async Task Sur_la_demo_une_cloture_faite_par_une_organisation_ne_s_annule_pas_sans_compte()
    {
        await using var banc = await BancApi.Demarrer();
        var organisation = await banc.Organisation("Imprimerie Arnaud", "admin@arnaud.fr");
        var site = banc.Live.SiteIds.First();
        var machine = banc.Live.Site(site)!.Machines.First().Id;
        var id = UsineExemple.Alarme(banc.Live, site, machine);
        Assert.Equal(HttpStatusCode.OK, (await organisation.Post($"/api/alarms/{id}/resolve")).StatusCode);

        var anonyme = await banc.Navigateur().Post($"/api/alarms/{id}/reopen");

        Assert.Equal(HttpStatusCode.Conflict, anonyme.StatusCode);
        Assert.Equal("resolue", banc.Live.Direct(site)!.Alarmes.Single(a => a.Id == id).Statut);
        Assert.Equal(HttpStatusCode.OK, (await organisation.Post($"/api/alarms/{id}/reopen")).StatusCode);
    }

    [Fact]
    public async Task Sans_l_entete_d_ecriture_la_reouverture_est_refusee()
    {
        await using var banc = await BancApi.Demarrer();
        var site = banc.Live.SiteIds.First();
        var id = UsineExemple.Alarme(banc.Live, site, banc.Live.Site(site)!.Machines.First().Id);
        var navigateur = banc.Navigateur();
        Assert.Equal(HttpStatusCode.OK, (await navigateur.Post($"/api/alarms/{id}/resolve")).StatusCode);

        var res = await navigateur.Post($"/api/alarms/{id}/reopen", entete: false);

        Assert.Equal(HttpStatusCode.Forbidden, res.StatusCode);
        Assert.Equal("resolue", banc.Live.Direct(site)!.Alarmes.Single(a => a.Id == id).Statut);
    }
}
