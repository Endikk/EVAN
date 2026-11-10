using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;

namespace EVAN.Infrastructure.Tests;

public class ReferenceDataTests
{
    private static ReferenceData Data() => JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    [Fact]
    public void Les_identifiants_suivent_la_convention_du_front()
    {
        var data = Data();
        var flexo = data.Demo.Usines.SelectMany(u => u.Machines).Single(m => m.Type == "flexo");
        var model = data.Model(flexo);
        Assert.Equal(9, model.Organes.Count);
        Assert.Contains(model.Points, p => p.Id == "m-r01.o1.tension");
        Assert.Equal("TB-101", model.Organes[0].AlarmeCode);
    }

    [Fact]
    public void L_organisation_d_exemple_a_deux_usines_chacune_avec_sa_passerelle()
    {
        var demo = Data().Demo;
        Assert.Equal(["site-tours", "site-crissey"], demo.Usines.Select(u => u.Site.Id));
        Assert.All(demo.Usines, u =>
        {
            Assert.Equal(demo.Organisation.Id, u.Site.OrganisationId);
            Assert.False(string.IsNullOrEmpty(u.Site.Passerelle));
            Assert.NotEmpty(u.Batiments);
            Assert.NotEmpty(u.Machines);
            Assert.All(u.Batiments, b => Assert.Equal(u.Site.Id, b.SiteId));
        });
        Assert.Equal("48 rue Paul Sabatier, 71530 Crissey", demo.Usine("site-crissey")!.Site.Adresse);
    }

    [Fact]
    public void Les_identifiants_sont_uniques_dans_toute_l_organisation()
    {
        // Base, flux temps réel et sujets MQTT les supposent uniques : deux usines ne partagent ni bâtiment, ni zone, ni machine.
        var usines = Data().Demo.Usines;
        string[] ids = [.. usines.Select(u => u.Site.Id), .. usines.SelectMany(u => u.Batiments.Select(b => b.Id)),
            .. usines.SelectMany(u => u.Zones.Select(z => z.Id)), .. usines.SelectMany(u => u.Machines.Select(m => m.Id))];
        Assert.Equal(ids.Length, ids.Distinct().Count());
        // Chaque zone et chaque machine appartiennent à un bâtiment de leur propre usine.
        Assert.All(usines, u =>
        {
            var batiments = u.Batiments.Select(b => b.Id).ToHashSet();
            Assert.All(u.Zones, z => Assert.Contains(z.BatimentId, batiments));
            Assert.All(u.Machines, m => Assert.Contains(m.BatimentId, batiments));
        });
    }

    [Fact]
    public void Le_schema_TimescaleDB_est_embarque()
    {
        var resources = typeof(PostgresStore).Assembly.GetManifestResourceNames();
        Assert.Contains($"{typeof(PostgresStore).Namespace}.Schema.sql", resources);
    }
}
