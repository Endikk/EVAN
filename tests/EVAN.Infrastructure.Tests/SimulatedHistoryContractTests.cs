using System.Text.Json;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;

namespace EVAN.Infrastructure.Tests;

/// <summary>
/// Contrat commun front / back : l'historique simulé et ses analyses (maintenance, énergie, chronologie d'une panne)
/// donnent ici exactement ce que donne le navigateur. Le résumé de référence, data/tests/historique.json, est produit par
/// src/EVAN.Front/src/sim/history.contract.test.ts.
/// </summary>
public class SimulatedHistoryContractTests
{
    private static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));
    private static readonly JsonElement Reference = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "data", "tests", "historique.json"))).RootElement;
    private static readonly long Maintenant = Reference.GetProperty("maintenant").GetInt64();

    public static TheoryData<string> Usines => new() { "site-tours", "site-crissey" };

    private static (JsonElement Ref, List<MachineModel> Models, HistoriqueSimule H) Usine(string id)
    {
        var reference = Reference.GetProperty("usines").EnumerateArray().Single(u => u.GetProperty("id").GetString() == id);
        var models = Data.Demo.Usine(id)!.Machines.Select(Data.Model).ToList();
        return (reference, models, new HistoriqueSimule(models, Maintenant, Fuseau.Paris));
    }

    private static void Proche(double attendu, double obtenu, double tolerance = 1e-9, string? quoi = null) =>
        Assert.True(Math.Abs(attendu - obtenu) <= tolerance * Math.Max(1, Math.Abs(attendu)), $"{quoi} : attendu {attendu:R}, obtenu {obtenu:R}");

    private static double? Nombre(JsonElement e) => e.ValueKind == JsonValueKind.Number ? e.GetDouble() : null;

    [Theory]
    [MemberData(nameof(Usines))]
    public void Memes_periodes_alarmes_et_TRS_que_le_navigateur(string usine)
    {
        var (r, _, h) = Usine(usine);
        Assert.Equal(r.GetProperty("debut").GetInt64(), h.Debut);
        Assert.Equal(r.GetProperty("fin").GetInt64(), h.Fin);

        var alarmes = r.GetProperty("alarmes").EnumerateArray().ToList();
        Assert.Equal(alarmes.Count, h.Alarmes.Count);
        for (var i = 0; i < alarmes.Count; i++)
        {
            var a = alarmes[i];
            var b = h.Alarmes[i];
            Assert.Equal(a.GetProperty("id").GetString(), b.Id);
            Assert.Equal(a.GetProperty("code").GetString(), b.Code);
            Assert.Equal(a.GetProperty("organeId").GetString(), b.OrganeId);
            Assert.Equal(a.GetProperty("pointId").GetString(), b.PointId);
            Assert.Equal(a.GetProperty("horodatage").GetInt64(), b.Horodatage);
            Assert.Equal(a.GetProperty("finLe").GetInt64(), b.FinLe);
            Assert.Equal(a.GetProperty("acquitteeLe").GetInt64(), b.AcquitteeLe);
            Assert.Equal(a.GetProperty("acquitteePar").GetString(), b.AcquitteePar);
            Assert.Equal(Nombre(a.GetProperty("valeur")), b.Valeur);
            Assert.Equal(Nombre(a.GetProperty("seuil")), b.Seuil);
            Assert.Equal(a.GetProperty("regle").GetString(), b.Regle);
        }

        foreach (var p in r.GetProperty("periodes").EnumerateObject())
        {
            var list = h.Periodes[p.Name];
            Assert.Equal(p.Value.GetProperty("n").GetInt32(), list.Count);
            foreach (var etat in new[] { "marche", "calage", "panne", "arret" })
                Assert.Equal(p.Value.GetProperty(etat).GetInt64(), list.Where(x => x.Etat == etat).Sum(x => x.Fin - x.Debut));
        }

        foreach (var m in r.GetProperty("trs").EnumerateObject())
        {
            var attendus = m.Value.EnumerateArray().Select(x => x.GetDouble()).ToList();
            var obtenus = h.Trs[m.Name].Select(j => j.Trs).ToList();
            Assert.Equal(attendus.Count, obtenus.Count);
            for (var i = 0; i < attendus.Count; i++) Proche(attendus[i], obtenus[i], 1e-12, $"TRS {m.Name} jour {i}");
        }
    }

    [Theory]
    [MemberData(nameof(Usines))]
    public void Memes_valeurs_de_mesure(string usine)
    {
        var (r, models, h) = Usine(usine);
        foreach (var v in r.GetProperty("valeurs").EnumerateArray())
        {
            var pointId = v.GetProperty("point").GetString()!;
            var model = models.Single(m => pointId.StartsWith(m.Machine.Id + ".o", StringComparison.Ordinal));
            var point = model.Points.Single(p => p.Id == pointId);
            // Sinus et puissances : la bibliothèque mathématique peut différer au dernier bit près.
            Proche(v.GetProperty("v").GetDouble(), h.Valeur(model, point, v.GetProperty("t").GetInt64()), 1e-9, pointId);
        }
    }

    [Theory]
    [MemberData(nameof(Usines))]
    public void Meme_usure_en_fin_d_historique(string usine)
    {
        var (r, models, _) = Usine(usine);
        var points = models.SelectMany(m => m.Points).Where(p => p.Type == "usure").ToDictionary(p => p.Id);
        var attendues = r.GetProperty("usure").EnumerateArray().ToList();
        Assert.Equal(attendues.Count, points.Count);
        foreach (var u in attendues)
        {
            var point = points[u.GetProperty("point").GetString()!];
            Proche(u.GetProperty("v").GetDouble(), HistoriqueSimule.NiveauUsure(point.Id, point.Nominal), 1e-12, point.Id);
        }
    }

    [Theory]
    [MemberData(nameof(Usines))]
    public void Memes_echeances_et_derives_de_maintenance(string usine)
    {
        var (r, models, h) = Usine(usine);
        var echeances = models.SelectMany(m => Maintenance.Echeances(h, m, Maintenant)).ToList();
        var attendues = r.GetProperty("maintenance").GetProperty("echeances").EnumerateArray().ToList();
        Assert.Equal(attendues.Count, echeances.Count);
        for (var i = 0; i < attendues.Count; i++)
        {
            var a = attendues[i];
            var e = echeances[i];
            Assert.Equal(a.GetProperty("id").GetString(), e.Id);
            Assert.Equal(a.GetProperty("statut").GetString(), e.Statut);
            Proche(a.GetProperty("compteur").GetDouble(), e.Compteur, 1e-9, e.Id);
            if (Nombre(a.GetProperty("echeance")) is { } ech) Proche(ech, e.EcheanceLe!.Value, 1e-9, e.Id);
            else Assert.Null(e.EcheanceLe);
        }

        // Chaque tâche du plan consignée deux heures plus tôt : mêmes compteurs remis à zéro que dans le navigateur.
        var apresSaisie = models.SelectMany(m => Maintenance.Echeances(h, m, Maintenant,
            (m.Type?.Maintenance ?? []).Select(t => new Saisie($"s-{m.Machine.Id}-{t.Id}", m.Machine.Id, null, "preventive", Maintenant - 2 * Duree.Heure, t.Duree, t.Tache, null, "Contrat", t.Id)).ToList())).ToList();
        var attenduesApres = r.GetProperty("maintenance").GetProperty("apresSaisie").EnumerateArray().ToList();
        Assert.Equal(attenduesApres.Count, apresSaisie.Count);
        for (var i = 0; i < attenduesApres.Count; i++)
        {
            var a = attenduesApres[i];
            var e = apresSaisie[i];
            Assert.Equal(a.GetProperty("id").GetString(), e.Id);
            Assert.Equal(a.GetProperty("statut").GetString(), e.Statut);
            Proche(a.GetProperty("compteur").GetDouble(), e.Compteur, 1e-9, e.Id);
            Assert.Equal(Nombre(a.GetProperty("dernierPassage")) is { } dp ? (long)dp : null, e.DernierPassage);
            if (Nombre(a.GetProperty("echeance")) is { } ech) Proche(ech, e.EcheanceLe!.Value, 1e-9, e.Id);
            else Assert.Null(e.EcheanceLe);
        }

        var previsions = models.SelectMany(m => Maintenance.Previsions(h, m, Maintenant)).ToList();
        var prevues = r.GetProperty("maintenance").GetProperty("previsions").EnumerateArray().ToList();
        Assert.Equal(prevues.Count, previsions.Count);
        for (var i = 0; i < prevues.Count; i++)
        {
            Assert.Equal(prevues[i].GetProperty("pointId").GetString(), previsions[i].PointId);
            Assert.Equal(prevues[i].GetProperty("niveau").GetString(), previsions[i].Niveau);
            Proche(prevues[i].GetProperty("pente").GetDouble(), previsions[i].Pente, 1e-9, "pente");
            Proche(prevues[i].GetProperty("franchissement").GetDouble(), previsions[i].Franchissement, 1e-9, "franchissement");
        }
    }

    [Theory]
    [MemberData(nameof(Usines))]
    public void Meme_bilan_energetique(string usine)
    {
        var (r, models, h) = Usine(usine);
        var energie = new Energie(Data);
        var machines = models.Select(m => m.Machine).ToList();
        var bilan = energie.BilanUsine(h, machines, h.Debut, Maintenant, Data.Catalogue.Energie);
        var e = r.GetProperty("energie");
        var kwh = e.GetProperty("kwh");
        Proche(kwh.GetProperty("marche").GetDouble(), bilan.Total.Kwh.Marche, 1e-12, "marche");
        Proche(kwh.GetProperty("calage").GetDouble(), bilan.Total.Kwh.Calage, 1e-12, "calage");
        Proche(kwh.GetProperty("panne").GetDouble(), bilan.Total.Kwh.Panne, 1e-12, "panne");
        Proche(kwh.GetProperty("arret").GetDouble(), bilan.Total.Kwh.Arret, 1e-12, "arret");
        Proche(e.GetProperty("production").GetDouble(), bilan.Total.Production, 1e-12, "production");

        var courbe = energie.CourbeDeCharge(h, machines, h.Debut, Maintenant, 30 * Duree.Minute);
        var pic = courbe.Aggregate((a, b) => b.Kw > a.Kw ? b : a);
        Assert.Equal(e.GetProperty("pic").GetProperty("t").GetInt64(), pic.T);
        Proche(e.GetProperty("pic").GetProperty("kw").GetDouble(), pic.Kw, 1e-12, "pic");
    }

    [Theory]
    [MemberData(nameof(Usines))]
    public void Meme_chronologie_des_pannes(string usine)
    {
        var (r, models, h) = Usine(usine);
        foreach (var c in r.GetProperty("chronologies").EnumerateArray())
        {
            var alarme = h.Alarmes.Single(a => a.Id == c.GetProperty("alarme").GetString());
            var chrono = Chronologie.Construire(h, models.Single(m => m.Machine.Id == alarme.MachineId), alarme)!;
            Assert.Equal(c.GetProperty("debut").GetInt64(), chrono.Debut);
            Assert.Equal(c.GetProperty("fin").GetInt64(), chrono.Fin);
            Assert.Equal(c.GetProperty("pas").GetInt64(), chrono.Pas);
            Assert.Equal(
                c.GetProperty("evenements").EnumerateArray().Select(x => (x.GetProperty("etape").GetString(), x.GetProperty("t").GetInt64())),
                chrono.Etapes.Select(x => ((string?)x.Etape, x.T)));
        }
    }
}
