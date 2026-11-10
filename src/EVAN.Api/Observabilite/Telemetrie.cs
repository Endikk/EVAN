using EVAN.Application.Observabilite;
using Npgsql;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace EVAN.Api.Observabilite;

/// <summary>
/// OpenTelemetry de l'API, exporté en OTLP vers le collecteur désigné par OTEL_EXPORTER_OTLP_ENDPOINT :
/// <list type="bullet">
/// <item>traces : requêtes HTTP reçues (sauf la sonde de santé), appels sortants (dont le modèle de l'assistant),
/// requêtes PostgreSQL ;</item>
/// <item>métriques : exécution .NET, ASP.NET Core, HttpClient, Npgsql, et les mesures métier « EVAN »
/// (<see cref="Metriques"/>) ;</item>
/// <item>journaux, reliés à la trace en cours.</item>
/// </list>
/// Variable absente : rien n'est enregistré ni exporté, l'API tourne comme avant. Les autres variables OTEL_* standard
/// (protocole, en-têtes d'authentification du collecteur, nom du service, échantillonnage) s'appliquent telles quelles.
/// Les chaînes de requête des adresses sont masquées par l'instrumentation, les en-têtes ne sont pas relevés.
/// </summary>
public static class Telemetrie
{
    public const string VariableCollecteur = "OTEL_EXPORTER_OTLP_ENDPOINT";

    /// <summary>Interrogée toutes les 10 s par Docker : des milliers de traces sans intérêt par jour.</summary>
    private static readonly PathString Sonde = "/api/health";

    public static TBuilder AddEvanTelemetrie<TBuilder>(this TBuilder builder) where TBuilder : IHostApplicationBuilder
    {
        if (string.IsNullOrWhiteSpace(builder.Configuration[VariableCollecteur])) return builder;

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(r => r.AddService(
                builder.Configuration["OTEL_SERVICE_NAME"] ?? "evan-api",
                serviceVersion: typeof(Telemetrie).Assembly.GetName().Version?.ToString()))
            .WithTracing(t => t
                .AddAspNetCoreInstrumentation(o => o.Filter = http => !http.Request.Path.StartsWithSegments(Sonde))
                .AddHttpClientInstrumentation()
                .AddNpgsql())
            .WithMetrics(m => m
                .AddRuntimeInstrumentation()
                .AddAspNetCoreInstrumentation()
                .AddHttpClientInstrumentation()
                .AddNpgsqlInstrumentation()
                .AddMeter(Metriques.Nom))
            .WithLogging()
            .UseOtlpExporter();
        return builder;
    }
}
