using EVAN.Api.Observabilite;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using OpenTelemetry.Metrics;
using OpenTelemetry.Trace;

namespace EVAN.Api.Tests;

/// <summary>OpenTelemetry ne s'enregistre que si un collecteur est désigné : sans lui, rien n'est relevé ni exporté.</summary>
public class TelemetrieTests
{
    private static WebApplicationBuilder Builder(string collecteur)
    {
        var builder = WebApplication.CreateBuilder();
        // Posée explicitement : une variable d'environnement du poste ou de la CI ne doit pas changer le résultat.
        builder.Configuration[Telemetrie.VariableCollecteur] = collecteur;
        return builder.AddEvanTelemetrie();
    }

    [Fact]
    public async Task Sans_collecteur_rien_n_est_enregistre()
    {
        var builder = Builder("");

        Assert.DoesNotContain(builder.Services, d => d.ServiceType.Namespace?.StartsWith("OpenTelemetry", StringComparison.Ordinal) == true);
        await using var app = builder.Build();
        Assert.Null(app.Services.GetService<TracerProvider>());
        Assert.Null(app.Services.GetService<MeterProvider>());
    }

    [Fact]
    public async Task Avec_un_collecteur_traces_et_metriques_sont_relevees()
    {
        // Port fermé : aucune donnée ne sort du poste pendant le test.
        await using var app = Builder("http://127.0.0.1:1").Build();

        Assert.NotNull(app.Services.GetService<TracerProvider>());
        Assert.NotNull(app.Services.GetService<MeterProvider>());
    }
}
