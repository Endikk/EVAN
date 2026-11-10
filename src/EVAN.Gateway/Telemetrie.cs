using EVAN.Gateway.Publishing;
using OpenTelemetry;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

namespace EVAN.Gateway;

/// <summary>
/// OpenTelemetry de la passerelle, exporté en OTLP vers le collecteur désigné par OTEL_EXPORTER_OTLP_ENDPOINT : traces
/// des appels HTTP (JMF), métriques d'exécution .NET, de HttpClient et de la file d'envoi (<see cref="MesuresEnvoi"/>),
/// journaux. Variable absente (le cas en usine, sauf collecteur local) : rien n'est enregistré ni exporté.
/// </summary>
internal static class Telemetrie
{
    public const string VariableCollecteur = "OTEL_EXPORTER_OTLP_ENDPOINT";

    public static HostApplicationBuilder AddEvanTelemetrie(this HostApplicationBuilder builder, string gatewayId)
    {
        if (string.IsNullOrWhiteSpace(builder.Configuration[VariableCollecteur])) return builder;

        builder.Services.AddOpenTelemetry()
            .ConfigureResource(r => r
                .AddService(
                    builder.Configuration["OTEL_SERVICE_NAME"] ?? "evan-gateway",
                    serviceVersion: typeof(Telemetrie).Assembly.GetName().Version?.ToString(),
                    serviceInstanceId: gatewayId))
            .WithTracing(t => t.AddHttpClientInstrumentation())
            .WithMetrics(m => m
                .AddRuntimeInstrumentation()
                .AddHttpClientInstrumentation()
                .AddMeter(MesuresEnvoi.Nom))
            .WithLogging()
            .UseOtlpExporter();
        return builder;
    }
}
