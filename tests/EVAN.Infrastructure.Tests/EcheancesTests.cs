using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Échéances du plan après une saisie, sur l'historique simulé de Tours : mêmes cas que analytics/maintenance.test.ts
/// côté front (le contrat data/tests/historique.json les rejoue aussi, tâche par tâche).
/// </summary>
public class EcheancesTests
{
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));
    private static readonly long Maintenant = DateTimeOffset.Parse("2026-10-08T08:30:00Z").ToUnixTimeMilliseconds();
    private static readonly List<MachineModel> Tours = Data.Demo.Usine("site-tours")!.Machines.Select(Data.Model).ToList();
    private static readonly HistoriqueSimule H = new(Tours, Maintenant, Fuseau.Paris);
    private static readonly MachineModel R01 = Tours.Single(m => m.Machine.Id == "m-r01");

    [Fact]
    public void Une_tache_suivie_par_une_mesure_d_usure_consignee_repart_de_zero_a_la_date_de_la_saisie()
    {
        var avant = Maintenance.Echeances(H, R01, Maintenant).Single(e => e.TacheId == "outil");
        var date = Maintenant - 2 * Duree.Heure;
        var saisie = new Saisie("s3", "m-r01", null, "preventive", date, 40, "Outil de découpe changé", null, "Test", "outil");

        var apres = Maintenance.Echeances(H, R01, Maintenant, [saisie]).Single(e => e.TacheId == "outil");

        Assert.Equal("conditionnelle", apres.Nature);
        Assert.True(avant.Compteur > apres.Compteur);
        Assert.InRange(apres.Compteur, 0, avant.Seuil * 0.05);
        Assert.Equal(date, apres.DernierPassage);
        Assert.Equal("ok", apres.Statut);
    }

    [Fact]
    public void Une_saisie_d_une_autre_machine_ou_a_venir_ne_remet_rien_a_zero()
    {
        var avant = Maintenance.Echeances(H, R01, Maintenant).Single(e => e.TacheId == "outil");
        Saisie[] saisies =
        [
            new("s4", "m-r04", null, "preventive", Maintenant - Duree.Heure, 40, "Ailleurs", null, "Test", "outil"),
            new("s5", "m-r01", null, "preventive", Maintenant + Duree.Heure, 40, "Plus tard", null, "Test", "outil"),
        ];

        var apres = Maintenance.Echeances(H, R01, Maintenant, saisies).Single(e => e.TacheId == "outil");

        Assert.Equal(avant.Compteur, apres.Compteur);
        Assert.Null(apres.DernierPassage);
    }

    [Fact]
    public void Les_passages_du_plan_ne_tombent_plus_tous_a_la_meme_heure()
    {
        var heures = Tours.SelectMany(m => Maintenance.Echeances(H, m, Maintenant))
            .Where(e => e.Nature == "systematique" && e.DernierPassage is not null)
            .Select(e => Fuseau.Local(Fuseau.Paris, e.DernierPassage!.Value).TimeOfDay)
            .ToList();

        Assert.True(heures.Distinct().Count() > 3);
        Assert.All(heures, h => Assert.InRange(h, TimeSpan.FromHours(6), TimeSpan.FromHours(19.75)));
    }
}
