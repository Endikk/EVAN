using EVAN.Infrastructure;
using EVAN.Messaging;
using EVAN.Simulator;
using EVAN.Simulator.Configuration;

// Simulateur de démonstration : machines de l'usine d'exemple → MQTT, comme une passerelle réelle.
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddEvanReferenceData(builder.Configuration);
builder.Services.AddEvanMqtt(builder.Configuration, "evan-simulator");
var options = new SimulatorOptions();
builder.Configuration.GetSection("Simulator").Bind(options);
builder.Services.AddSingleton(options);
builder.Services.AddHostedService<SimulatorWorker>();
builder.Build().Run();
