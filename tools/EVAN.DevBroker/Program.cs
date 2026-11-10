using MQTTnet.Server;

// Broker MQTT minimal pour le développement local : TCP en clair, sans authentification.
// Usage : dotnet run --project tools/EVAN.DevBroker [-- port]   (18830 par défaut)
// En production, utiliser Mosquitto ou EMQX avec TLS et certificats clients (voir docker-compose.yml).
var port = args.Length > 0 && int.TryParse(args[0], out var p) ? p : 18830;
var options = new MqttServerOptionsBuilder().WithDefaultEndpoint().WithDefaultEndpointPort(port).Build();
using var server = new MqttServerFactory().CreateMqttServer(options);
long messages = 0;
server.InterceptingPublishAsync += _ =>
{
    Interlocked.Increment(ref messages);
    return Task.CompletedTask;
};
server.ClientConnectedAsync += e =>
{
    Console.WriteLine($"{DateTime.Now:T} connecté : {e.ClientId}");
    return Task.CompletedTask;
};
await server.StartAsync();
Console.WriteLine($"Broker MQTT de développement sur le port {port} (sans TLS). Ctrl+C pour arrêter.");
using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};
while (!cts.IsCancellationRequested)
{
    await Task.Delay(30_000, cts.Token).ContinueWith(_ => { });
    Console.WriteLine($"{DateTime.Now:T} {Interlocked.Read(ref messages)} messages relayés");
}
await server.StopAsync();
