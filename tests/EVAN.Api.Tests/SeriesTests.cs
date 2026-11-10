using System.Net;
using EVAN.Api;
using EVAN.Api.Endpoints;
using EVAN.Application.Abstractions;
using EVAN.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace EVAN.Api.Tests;

/// <summary>Courbe d'un point : fenêtre bornée (400 jours au plus, 2000 seaux au plus), fenêtre vide refusée.</summary>
public class SeriesTests
{
    private static readonly DateTimeOffset Maintenant = new(2026, 10, 8, 10, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Une_fenetre_vide_ou_inversee_est_refusee()
    {
        Assert.Null(PointEndpoints.Borner(Maintenant, Maintenant, null, Maintenant));
        Assert.Null(PointEndpoints.Borner(Maintenant, Maintenant.AddHours(-1), null, Maintenant));
    }

    [Fact]
    public void Par_defaut_la_derniere_heure_en_600_points()
    {
        var f = PointEndpoints.Borner(null, null, null, Maintenant)!;

        Assert.Equal((Maintenant.AddHours(-1), Maintenant, TimeSpan.FromSeconds(6)), (f.From, f.To, f.Bucket));
    }

    [Fact]
    public void Le_debut_ne_remonte_pas_au_dela_de_400_jours()
    {
        var f = PointEndpoints.Borner(Maintenant.AddYears(-3), Maintenant, null, Maintenant)!;

        Assert.Equal(Maintenant.AddDays(-400), f.From);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(-5)]
    [InlineData(null)]
    public void Le_pas_ne_donne_jamais_plus_de_2000_seaux(int? bucketSeconds)
    {
        var f = PointEndpoints.Borner(Maintenant.AddDays(-30), Maintenant, bucketSeconds, Maintenant)!;

        Assert.True((f.To - f.From) / f.Bucket <= PointEndpoints.SeauxMax);
        Assert.True(f.Bucket >= TimeSpan.FromSeconds(1));
    }

    [Fact]
    public async Task La_route_refuse_une_fenetre_inversee_et_sert_une_fenetre_valide()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddSingleton<IStore, MemoryStore>().AddEvanTimeouts();
        await using var app = builder.Build();
        app.UseRequestTimeouts();
        app.MapGroup("/api").MapPointEndpoints();
        await app.StartAsync();
        var http = app.GetTestClient();

        var inversee = await http.GetAsync("/api/points/m-r01.o1.tension/series?from=2026-10-08T10:00:00Z&to=2026-10-08T09:00:00Z");
        var valide = await http.GetAsync("/api/points/m-r01.o1.tension/series?from=2026-10-08T09:00:00Z&to=2026-10-08T10:00:00Z&bucketSeconds=1");

        Assert.Equal(HttpStatusCode.BadRequest, inversee.StatusCode);
        Assert.Equal(HttpStatusCode.OK, valide.StatusCode);
    }
}
