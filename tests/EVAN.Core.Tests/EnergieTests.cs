using System.Text.Json;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Core.Domain.Machines;
using EVAN.Core.Domain.Sites;

namespace EVAN.Core.Tests;

/// <summary>Énergie : mêmes cas que src/EVAN.Front/src/analytics/energy.test.ts.</summary>
public class EnergieTests
{
    private static readonly ReferenceData Data = new()
    {
        Catalogue = JsonSerializer.Deserialize<Catalogue>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "data", "catalog.json")), Json.Options)!,
        Kit = new Kit(),
        Demo = new DemoOrganisation { Organisation = new Organisation("org", "Test"), Usines = [] },
    };

    private static readonly long T0 = Fuseau.Instant(Fuseau.Paris, new DateTime(2026, 10, 5));
    private static readonly Machine Flexo = new("m1", "b", null, "flexo", "Flexo", "R01", [0, 0], 0, new ModeleRef(""));

    private sealed class Historique(IReadOnlyList<Periode> periodes) : IHistorique
    {
        public long Debut => T0;
        public long Fin => T0 + 48 * Duree.Heure;
        public TimeZoneInfo Fuseau => Core.Domain.Exploitation.Fuseau.Paris;
        public IReadOnlyDictionary<string, IReadOnlyList<Periode>> Periodes => new Dictionary<string, IReadOnlyList<Periode>> { ["m1"] = periodes };
        public IReadOnlyList<Alarme> Alarmes => [];
        public IReadOnlyDictionary<string, IReadOnlyList<TrsJour>> Trs => new Dictionary<string, IReadOnlyList<TrsJour>>
        {
            ["m1"] = [new TrsJour(T0, 1, 0.9, 0.98, 0.88, 600, 60, 0, 0)],
        };
        public double Valeur(MachineModel machine, PointDeMesure point, long t) => point.Nominal;
    }

    private static Historique H(params (double A, double B, string Etat)[] p) =>
        new(p.Select(x => new Periode(T0 + (long)(x.A * Duree.Heure), T0 + (long)(x.B * Duree.Heure), x.Etat)).ToList());

    [Fact]
    public void Integre_les_periodes_par_etat()
    {
        var b = new Energie(Data).BilanMachine(H((0, 2, "arret"), (2, 3, "marche"), (3, 3.5, "calage"), (3.5, 3.75, "panne")), Flexo, T0, T0 + 24 * Duree.Heure, new ParametresEnergie(0.05, 0.2));
        Assert.Equal(new KwhParEtat(72, 19, 4.5, 6), b.Kwh);
        Assert.Equal(101.5, b.Total);
        Assert.Equal(5.075, b.Co2Kg, 9);
        Assert.Equal(20.3, b.CoutEuros, 9);
        Assert.Equal(60 * (150 / 0.11) * 0.9 * 0.98, b.Production, 3);
    }

    [Fact]
    public void La_courbe_de_charge_est_la_puissance_moyenne_de_chaque_tranche()
    {
        var c = new Energie(Data).CourbeDeCharge(H((0, 0.5, "arret"), (0.5, 1, "marche")), [Flexo], T0, T0 + Duree.Heure, Duree.Heure);
        Assert.Equal((3 + 72) / 2.0, Assert.Single(c).Kw, 9);
    }

    [Fact]
    public void Coupe_les_jours_a_minuit_heure_locale()
    {
        var jours = new Energie(Data).ParJour(H((22, 26, "marche")), [Flexo], T0, T0 + 48 * Duree.Heure);
        Assert.Equal([144.0, 144.0], jours.Select(j => j.Kwh.Marche));
    }

    [Fact]
    public void Chiffre_la_veille_a_l_annee()
    {
        var energie = new Energie(Data);
        var bilan = energie.BilanUsine(H((0, 10, "arret"), (10, 12, "marche")), [Flexo], T0, T0 + 24 * Duree.Heure, Data.Catalogue.Energie);
        Assert.Equal(30 / (30.0 + 144), bilan.HorsProduction, 9);
        Assert.Equal(30 * 365, energie.Gisements(bilan, 1, Data.Catalogue.Energie).Single(g => g.Id == "veille").KwhAn, 6);
    }
}
