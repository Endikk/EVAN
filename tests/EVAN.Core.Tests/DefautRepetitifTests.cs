using System.Text.Json;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Diagnostics;

namespace EVAN.Core.Tests;

/// <summary>Cas de test communs avec le front (data/tests/defaut-repetitif.json) : même pas mesuré, même pièce en cause.</summary>
public class DefautRepetitifTests
{
    private static readonly Catalogue Catalogue = Lire<Catalogue>("catalog.json");
    private static readonly Kit Kit = Lire<Kit>("machines.json");
    private static readonly JsonElement Cas = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "data", "tests", "defaut-repetitif.json"))).RootElement;

    private static T Lire<T>(string fichier) => JsonSerializer.Deserialize<T>(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "data", fichier)), Json.Options)!;

    private static IEnumerable<(int, string, IReadOnlyList<CylindreDef>)> Organes(string type) =>
        Kit.Machines.Single(m => m.Id == type).Points.Select(p =>
            (p.Numero, p.Nom, (IReadOnlyList<CylindreDef>)(Catalogue.Types[type].Organes.GetValueOrDefault(p.Numero.ToString())?.Cylindres ?? new List<CylindreDef>())));

    public static TheoryData<string> Noms()
    {
        var data = new TheoryData<string>();
        foreach (var c in JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "data", "tests", "defaut-repetitif.json"))).RootElement.GetProperty("cas").EnumerateArray())
            data.Add(c.GetProperty("nom").GetString()!);
        return data;
    }

    [Theory]
    [MemberData(nameof(Noms))]
    public void Designe_la_meme_piece_que_le_front(string nom)
    {
        var c = Cas.GetProperty("cas").EnumerateArray().Single(x => x.GetProperty("nom").GetString() == nom);
        var nature = c.TryGetProperty("nature", out var n) ? n.GetString() : null;
        var d = DefautRepetitif.Diagnostiquer(Organes(c.GetProperty("type").GetString()!), c.GetProperty("pas").GetDouble(), nature);

        if (c.TryGetProperty("nombre", out var nombre)) Assert.Equal(nombre.GetInt32(), d.Candidats.Count);
        if (c.TryGetProperty("premier", out var premier))
        {
            var p = d.Candidats[0];
            Assert.Equal(premier.GetProperty("organe").GetInt32(), p.OrganeNumero);
            Assert.Equal(premier.GetProperty("cylindre").GetString(), p.Cylindre);
            Assert.Equal(premier.GetProperty("rapport").GetDouble(), p.Rapport);
            Assert.Equal(premier.GetProperty("confiance").GetString(), p.Confiance);
        }
        if (c.TryGetProperty("memeDeveloppement", out var meme))
            foreach (var x in meme.EnumerateArray()) Assert.Contains(x.GetString(), d.Candidats[0].MemeDeveloppement);
        if (c.TryGetProperty("contient", out var contient))
            foreach (var x in contient.EnumerateArray())
                Assert.Contains(d.Candidats, k => k.Cylindre == x.GetProperty("cylindre").GetString() && k.Rapport == x.GetProperty("rapport").GetDouble());
    }

    [Fact]
    public void Calcule_la_circonference_depuis_le_diametre_ou_le_developpement()
    {
        Assert.Equal(Math.PI * 100, new CylindreDef { Nom = "r", Nature = "marque", Diametre = 100 }.Circonference, 9);
        Assert.Equal(381, new CylindreDef { Nom = "c", Nature = "impression", Developpement = 381 }.Circonference);
        Assert.Empty(DefautRepetitif.Diagnostiquer(Organes("flexo"), 0).Candidats);
    }
}
