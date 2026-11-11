using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Core.Domain.Machines;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Historique simulé d'une usine où l'on vient de poser une machine (CreeLe) : comme côté front (sim/history.test.ts),
/// elle n'a pas encore d'historique, et le défaut répétitif de la démo ne s'écrit que sur une flexo qui en a un.
/// </summary>
public class HistoriqueSimuleTests
{
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));
    private static readonly long Maintenant = DateTimeOffset.Parse("2026-10-08T08:30:00Z").ToUnixTimeMilliseconds();

    /// <summary>Une machine de l'usine d'exemple du type demandé, sous un autre identifiant.</summary>
    private static Machine Machine(string id, string type, long? creeLe = null) =>
        Data.Demo.Usines.SelectMany(u => u.Machines).First(m => m.Type == type) with { Id = id, CreeLe = creeLe };

    private static HistoriqueSimule Historique(long maintenant, params Machine[] machines) =>
        new(machines.Select(Data.Model), maintenant, Fuseau.Paris);

    [Fact]
    public void Ne_plante_pas_quand_la_seule_flexo_vient_d_etre_posee()
    {
        var h = Historique(Maintenant, Machine("m-offset", "offset"), Machine("m-flexo-neuve", "flexo", Maintenant - 60_000));

        Assert.False(h.Periodes.ContainsKey("m-flexo-neuve"));
        Assert.DoesNotContain(h.Alarmes, a => a.MachineId == "m-flexo-neuve");
        Assert.True(h.Periodes.ContainsKey("m-offset"));
    }

    [Fact]
    public void Ecrit_le_defaut_repetitif_sur_la_flexo_d_origine_pas_sur_celle_posee_pendant_la_session()
    {
        var h = Historique(Maintenant + 7 * Duree.Heure, Machine("m-flexo-neuve", "flexo", Maintenant - 60_000), Machine("m-flexo", "flexo"));

        // Le scénario : trois casses d'échenillage (organe 7) dans la dernière journée travaillée.
        Assert.True(h.Alarmes.Count(a => a.MachineId == "m-flexo" && a.OrganeId == "m-flexo.o7") >= 3);
        Assert.DoesNotContain(h.Alarmes, a => a.MachineId == "m-flexo-neuve");
    }

    [Fact]
    public void Deux_machines_du_meme_type_n_ont_pas_la_meme_usure()
    {
        var models = new[] { Machine("m-offset-a", "offset"), Machine("m-offset-b", "offset") }.Select(Data.Model).ToList();
        var h = new HistoriqueSimule(models, Maintenant, Fuseau.Paris);

        var usures = models.Select(m => h.Valeur(m, m.Points.Single(p => p.Cle == "heures_blanchet"), h.Fin)).ToList();

        Assert.NotEqual(usures[0], usures[1]);
        // À 30 % près du nominal du catalogue (610 h), sous le seuil d'attention.
        Assert.All(usures, u => Assert.InRange(u, 610 * 0.7, 610 * 1.3));
    }
}
