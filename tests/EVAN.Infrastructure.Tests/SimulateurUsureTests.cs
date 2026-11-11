using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;
using EVAN.Simulator;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Simulateur de démonstration (EVAN.Simulator) : l'usure en direct part de là où l'historique simulé s'arrête, comme
/// le simulateur du navigateur. Sinon la supervision et le carnet de maintenance montreraient deux compteurs.
/// </summary>
public class SimulateurUsureTests
{
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    [Fact]
    public void L_usure_en_direct_part_de_la_fin_de_l_historique()
    {
        var offsets = Data.Demo.Usine("site-tours")!.Machines.Where(m => m.Type == "offset").Select(Data.Model).ToList();

        var valeurs = offsets.Select((model, i) =>
        {
            var point = model.Points.Single(p => p.Cle == "heures_blanchet");
            // Pas de temps nul : la valeur publiée est la valeur de départ.
            var (metrics, _) = new MachineSimulator(model, i).Step("site-tours", DateTimeOffset.UtcNow, 0);
            return (Attendue: Math.Round(HistoriqueSimule.NiveauUsure(point.Id, 610), 4), Publiee: metrics.Single(m => m.Point == point.Id).Value);
        }).ToList();

        Assert.All(valeurs, v => Assert.Equal(v.Attendue, v.Publiee));
        Assert.True(valeurs.Select(v => v.Publiee).Distinct().Count() > 1);
    }
}
