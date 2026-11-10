using EVAN.Core.Contracts;
using EVAN.Gateway;
using EVAN.Gateway.Configuration;
using EVAN.Gateway.Publishing;
using EVAN.Gateway.Security;
using EVAN.Gateway.Sources;
using EVAN.Messaging;

// Passerelle edge installée dans l'usine (service Windows ou conteneur) :
// machines (OPC UA, Modbus TCP, S7, JMF) → MQTT sur TLS vers le back. Aucun port entrant.
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(o => o.ServiceName = "EVAN Gateway");

var options = new GatewayOptions();
builder.Configuration.GetSection("Gateway").Bind(options);
builder.Services.AddSingleton(options);
// Traces, métriques et journaux OpenTelemetry, seulement si un collecteur est désigné (OTEL_EXPORTER_OTLP_ENDPOINT).
builder.AddEvanTelemetrie(options.GatewayId);
builder.Services.AddEvanMqtt(builder.Configuration, $"evan-gw-{options.GatewayId}", mqtt =>
{
    // Dernière volonté : si la passerelle disparaît, le broker publie « offline » à sa place.
    mqtt.WillTopic ??= Topics.GatewayStatus(options.SiteId, options.GatewayId);
    mqtt.WillPayload ??= $$"""{"gatewayId":"{{options.GatewayId}}","status":"offline"}""";
});
// Lecture JMF : une presse ne renvoie pas ailleurs (pas de redirection suivie), et une réponse Status tient en quelques Ko.
builder.Services.AddHttpClient("jmf", c =>
    {
        c.Timeout = TimeSpan.FromSeconds(10);
        c.MaxResponseContentBufferSize = 1024 * 1024;
    })
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler { AllowAutoRedirect = false });
builder.Services.AddSingleton<MachineSourceFactory>();
builder.Services.AddSingleton<WriteGuard>();
// Tests de liaison : hôtes des connexions déclarées et Gateway:AllowedTestTargets, rien d'autre du réseau atelier.
builder.Services.AddSingleton(sp => new GardeTestLiaison(options, sp.GetRequiredService<ILogger<GardeTestLiaison>>()));
builder.Services.AddSingleton<TelemetryPublisher>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelemetryPublisher>());
builder.Services.AddHostedService<GatewayWorker>();
builder.Build().Run();
