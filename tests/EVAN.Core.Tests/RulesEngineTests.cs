using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;

namespace EVAN.Core.Tests;

/// <summary>
/// Moteur de règles : cas communs avec le front (data/tests/regles.json), rejoués aussi par
/// src/EVAN.Front/src/sim/rules.test.ts. Mêmes mesures, mêmes alarmes émises, dans le même ordre. La reprise au
/// redémarrage n'existe que côté back : son test reste ici, écrit à la main.
/// </summary>
public class RulesEngineTests
{
    private const long PasMs = 1000;
    /// <summary>Sinus et puissances : la bibliothèque mathématique peut différer au dernier bit près entre .NET et le navigateur.</summary>
    private const double Tolerance = 1e-9;

    private static readonly JsonElement Fichier = Lire();
    private static readonly JsonSerializerOptions Lisible = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
    /// <summary>Champs montrés pour un événement en trop, qu'aucun attendu ne décrit.</summary>
    private static readonly string[] ChampsEnTrop = ["type", "alarme", "gravite", "regle", "code", "horodatage", "message"];

    private static JsonElement Lire() =>
        JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "data", "tests", "regles.json"))).RootElement;

    private sealed record AlarmeCatalogue(string Code, string Message);

    private sealed record OrganeCas(int Numero, string Nom, string? Methode, AlarmeCatalogue? Alarme);

    private sealed class Ctx(Organe organe, (MesureDef, OrganeCatalogue) def, int recentes) : RulesEngine.IContext
    {
        public readonly List<(Alarme A, string Kind)> Events = new();
        public Organe? Organe(PointDeMesure point) => organe;
        public (MesureDef Mesure, OrganeCatalogue Organe)? Def(PointDeMesure point) => def;
        public int CountRecent(string machineId, string code, long since) => recentes;
        public void Emit(Alarme alarm, string kind) => Events.Add((alarm, kind));
    }

    public static TheoryData<string> Cas()
    {
        var data = new TheoryData<string>();
        foreach (var c in Lire().GetProperty("cas").EnumerateArray()) data.Add(c.GetProperty("nom").GetString()!);
        return data;
    }

    /// <summary>Valeur par défaut du fichier, champs redéfinis par le cas.</summary>
    private static T Fusion<T>(JsonElement? cas, string nom)
    {
        var champs = Fichier.GetProperty(nom).EnumerateObject().ToDictionary(p => p.Name, p => p.Value);
        if (cas is { } c && c.TryGetProperty(nom, out var surcharge))
        {
            foreach (var p in surcharge.EnumerateObject()) champs[p.Name] = p.Value;
        }
        return JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(champs), Json.Options)!;
    }

    private static double Nombre(JsonElement e, string nom) => e.TryGetProperty(nom, out var v) ? v.GetDouble() : 0;

    /// <summary>Joue un cas sur un moteur neuf : niveaux rendus et événements émis, chaque alarme numérotée dans l'ordre d'apparition.</summary>
    private static (List<string> Niveaux, List<Dictionary<string, object?>> Evenements) Jouer(JsonElement cas)
    {
        var point = Fusion<PointDeMesure>(cas, "point");
        var o = Fusion<OrganeCas>(cas, "organe");
        var organe = new Organe(point.OrganeId, point.MachineId, o.Numero, o.Nom, null, null, o.Methode, o.Alarme?.Code, o.Alarme?.Message);
        var mesure = new MesureDef
        {
            Cle = point.Cle, Libelle = point.Libelle, Type = point.Type, Unite = point.Unite, Nominal = point.Nominal, Seuils = point.Seuils,
            Dynamique = cas.TryGetProperty("dynamique", out var d) ? d.GetString() : null,
        };
        var panne = cas.TryGetProperty("panne", out var p)
            ? new PanneDef { Mesure = p.GetProperty("mesure").GetString()!, Forme = "rampe", Duree = 1, Cause = p.GetProperty("cause").GetString()! }
            : null;
        var ctx = new Ctx(organe, (mesure, new OrganeCatalogue { Mesures = [mesure], Panne = panne }), (int)Nombre(cas, "recentes"));
        var moteur = new RulesEngine(ctx);
        var enService = !cas.TryGetProperty("enService", out var s) || s.GetBoolean();

        var ids = new List<string>();
        var niveaux = new List<string>();
        long t = 0;
        void Mesurer(double v) => niveaux.Add(moteur.Evaluate(point, v, t += PasMs, enService));
        foreach (var etape in cas.GetProperty("etapes").EnumerateArray())
        {
            if (etape.TryGetProperty("mesures", out var mesures))
            {
                foreach (var v in mesures.EnumerateArray()) Mesurer(v.GetDouble());
            }
            else if (etape.TryGetProperty("serie", out var serie))
            {
                var n = serie.GetProperty("n").GetInt32();
                for (var i = 0; i < n; i++)
                    Mesurer(Nombre(serie, "depart") + Nombre(serie, "pente") * i + Nombre(serie, "amplitude") * Math.Sin(Nombre(serie, "pulsation") * i));
            }
            else
            {
                t += PasMs;
                moteur.Resolve(ids.ElementAtOrDefault(etape.GetProperty("resoudre").GetInt32() - 1) ?? "", t);
            }
            // Numérotation au fil de l'eau : l'alarme à clore à la main doit déjà être connue.
            foreach (var (a, _) in ctx.Events)
            {
                if (!ids.Contains(a.Id)) ids.Add(a.Id);
            }
        }
        var evenements = ctx.Events.Select(e => new Dictionary<string, object?>
        {
            ["type"] = e.Kind, ["alarme"] = ids.IndexOf(e.A.Id) + 1, ["gravite"] = e.A.Gravite, ["regle"] = e.A.Regle, ["statut"] = e.A.Statut,
            ["code"] = e.A.Code, ["message"] = e.A.Message, ["cause"] = e.A.Cause, ["horodatage"] = e.A.Horodatage, ["finLe"] = e.A.FinLe,
            ["valeur"] = e.A.Valeur, ["seuil"] = e.A.Seuil, ["repetitions"] = e.A.Repetitions,
        }).ToList();
        return (niveaux, evenements);
    }

    /// <summary>L'événement obtenu ramené aux champs attendus ; un nombre assez proche prend la valeur attendue, pour un écart lisible.</summary>
    private static JsonObject Projeter(Dictionary<string, object?> obtenu, IEnumerable<(string Nom, JsonElement? Attendu)> champs)
    {
        var p = new JsonObject();
        foreach (var (nom, attendu) in champs)
        {
            var v = obtenu.GetValueOrDefault(nom);
            var proche = attendu is { ValueKind: JsonValueKind.Number } a && v is double or long or int
                && Math.Abs(a.GetDouble() - Convert.ToDouble(v)) <= Tolerance * Math.Max(1, Math.Abs(a.GetDouble()));
            p[nom] = proche ? JsonNode.Parse(attendu!.Value.GetRawText()) : v is null ? null : JsonSerializer.SerializeToNode(v);
        }
        return p;
    }

    [Fact]
    public void Classe_une_valeur_selon_ses_seuils()
    {
        var defaut = Fusion<PointDeMesure>(null, "point").Seuils;
        foreach (var c in Fichier.GetProperty("classement").EnumerateArray())
        {
            var seuils = c.TryGetProperty("seuils", out var s) ? s.Deserialize<Seuils>(Json.Options)! : defaut;
            var v = c.GetProperty("v").GetDouble();
            Assert.True(c.GetProperty("niveau").GetString() == RulesEngine.Classify(v, seuils), $"{v} : attendu {c.GetProperty("niveau")}, obtenu {RulesEngine.Classify(v, seuils)}");
        }
    }

    [Theory]
    [MemberData(nameof(Cas))]
    public void Memes_alarmes_que_le_front(string nom)
    {
        var cas = Fichier.GetProperty("cas").EnumerateArray().Single(c => c.GetProperty("nom").GetString() == nom);

        var (niveaux, evenements) = Jouer(cas);

        if (cas.TryGetProperty("niveaux", out var attendus)) Assert.Equal(attendus.EnumerateArray().Select(n => n.GetString()), niveaux);
        var attendu = cas.GetProperty("evenements").EnumerateArray().ToList();
        var obtenus = new JsonArray(evenements.Select((e, i) => (JsonNode)Projeter(e, i < attendu.Count
            ? attendu[i].EnumerateObject().Select(c => (c.Name, (JsonElement?)c.Value))
            : ChampsEnTrop.Select(c => (c, (JsonElement?)null)))).ToArray());
        Assert.Equal(JsonNode.Parse(cas.GetProperty("evenements").GetRawText())!.ToJsonString(Lisible), obtenus.ToJsonString(Lisible));
    }

    private static readonly PointDeMesure Point = new("m1.o1.tension", "m1", "m1.o1", "tension", "Tension de bande", "tension", "N", 180,
        new Seuils(AlarmeBas: 120, AttentionBas: 150, AttentionHaut: 212, AlarmeHaut: 235));

    private sealed class CtxReprise : RulesEngine.IContext
    {
        public readonly List<(Alarme A, string Kind)> Events = new();
        public Organe? Organe(PointDeMesure point) => new("m1.o1", "m1", 1, "Dérouleur", null, null, "Méthode", "TB-101", "Tension hors tolérance");
        public (MesureDef Mesure, OrganeCatalogue Organe)? Def(PointDeMesure point) => null;
        public int CountRecent(string machineId, string code, long since) => 0;
        public void Emit(Alarme alarm, string kind) => Events.Add((alarm, kind));
    }

    [Fact]
    public void Une_alarme_reprise_au_redemarrage_n_est_pas_levee_une_seconde_fois()
    {
        var ctx = new CtxReprise();
        var engine = new RulesEngine(ctx);
        engine.Restore(new Alarme
        {
            Id = "al-avant", Code = "TB-101", Message = "Tension hors tolérance", Gravite = "critique", MachineId = "m1", OrganeId = "m1.o1", PointId = Point.Id, Horodatage = 500,
        });

        engine.Evaluate(Point, 240, 1000, true);
        engine.Resolve("al-avant", 2000);

        Assert.DoesNotContain(ctx.Events, e => e.Kind == "raised");
        Assert.Contains(ctx.Events, e => e.Kind == "cleared" && e.A.Id == "al-avant");
    }

    [Fact]
    public void Apres_une_intervention_la_mesure_qui_revient_a_la_normale_ne_leve_aucune_alarme()
    {
        var ctx = new CtxReprise();
        var engine = new RulesEngine(ctx);
        engine.Evaluate(Point, 240, 1000, true);
        var critique = ctx.Events.Single(e => e.Kind == "raised").A;
        engine.Resolve(critique.Id, 2000);
        engine.BeginRecovery(Point.Id, 2000);

        // Retour vers 180 N : la mesure repasse par la zone « à surveiller » (212 à 235 N) sans y lever d'alarme.
        var niveaux = new[] { 238.0, 225, 214, 200, 190, 184, 181 }.Select((v, i) => engine.Evaluate(Point, v, 3000 + i * 1000, true)).ToList();

        Assert.All(niveaux, n => Assert.Equal("ok", n));
        Assert.Single(ctx.Events, e => e.Kind == "raised");
        // Revenue à la normale, la mesure est de nouveau jugée : un nouveau franchissement lève une nouvelle alarme.
        Assert.Equal("attention", engine.Evaluate(Point, 220, 20_000, true));
        Assert.Contains(ctx.Events, e => e.Kind == "raised" && e.A.Gravite == "attention");
    }

    [Fact]
    public void Une_mesure_qui_ne_revient_pas_a_la_normale_apres_l_intervention_est_de_nouveau_jugee()
    {
        var ctx = new CtxReprise();
        var engine = new RulesEngine(ctx);
        engine.BeginRecovery(Point.Id, 0);

        Assert.Equal("ok", engine.Evaluate(Point, 240, 30_000, true));
        Assert.DoesNotContain(ctx.Events, e => e.Kind == "raised");
        // Passé le délai de reprise, une réparation qui n'a pas tenu se voit : l'alarme repart.
        Assert.Equal("alarme", engine.Evaluate(Point, 240, 61_000, true));
        Assert.Contains(ctx.Events, e => e.Kind == "raised" && e.A.Gravite == "critique");
    }

    [Fact]
    public void Une_alarme_rouverte_reprend_sa_place_au_lieu_d_en_lever_une_seconde()
    {
        var ctx = new CtxReprise();
        var engine = new RulesEngine(ctx);
        engine.Evaluate(Point, 240, 1000, true);
        var critique = ctx.Events.Single(e => e.Kind == "raised").A;
        engine.Resolve(critique.Id, 2000);
        engine.BeginRecovery(Point.Id, 2000);

        // Clôture annulée : le moteur tient de nouveau l'alarme, la reprise de ce point s'arrête.
        engine.Restore(critique);
        Assert.Equal("alarme", engine.Evaluate(Point, 240, 3000, true));

        Assert.Single(ctx.Events, e => e.Kind == "raised");
        engine.Resolve(critique.Id, 4000);
        Assert.Equal(2, ctx.Events.Count(e => e.Kind == "cleared" && e.A.Id == critique.Id));
    }

    [Fact]
    public void Un_point_oublie_repart_d_une_page_blanche()
    {
        var ctx = new CtxReprise();
        var engine = new RulesEngine(ctx);
        engine.Evaluate(Point, 220, 1000, true);
        Assert.Single(ctx.Events, e => e.Kind == "raised");

        engine.Forget(Point.Id);
        // Le moteur ne tient plus l'alarme d'attention : la mesure toujours haute en lève une nouvelle.
        engine.Evaluate(Point, 220, 2000, true);
        Assert.Equal(2, ctx.Events.Count(e => e.Kind == "raised"));
    }
}
