using EVAN.Api;
using EVAN.Api.Observabilite;
using EVAN.Application;
using EVAN.Infrastructure;

// Composition : Core (domaine) ← Application (cas d'usage, ports) ← Infrastructure (MQTT, TimescaleDB) ← Api (REST, SignalR).
var builder = WebApplication.CreateBuilder(args);
// Traces, métriques et journaux OpenTelemetry, seulement si un collecteur est désigné (OTEL_EXPORTER_OTLP_ENDPOINT).
builder.AddEvanTelemetrie();

builder.Services
    .AddEvanApplication()
    .AddEvanInfrastructure(builder.Configuration)
    .AddEvanApi(builder.Configuration);

var app = builder.Build();
// Chaîne des requêtes et table des routes (DependencyInjection.UseEvanApi), la même que dans les tests de l'API.
app.UseEvanApi();
app.Run();

public partial class Program;
