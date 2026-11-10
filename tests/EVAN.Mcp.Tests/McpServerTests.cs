using EVAN.Application;
using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Core.Domain.Alarms;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;

namespace EVAN.Mcp.Tests;

/// <summary>Le serveur MCP de bout en bout : un client MCP se connecte en Streamable HTTP, liste les outils, en appelle un.</summary>
public class McpServerTests : IAsyncLifetime
{
    private sealed class Bus : IMessageBus
    {
        public bool IsConnected => true;
        public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default) => Task.FromResult(true);
        public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class =>
            Task.FromResult<TReply?>(null);
    }

    private sealed class Notifier : IRealtimeNotifier
    {
        public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) => Task.CompletedTask;
        public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default) => Task.CompletedTask;
        public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default) => Task.CompletedTask;
        public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default) => Task.CompletedTask;
    }

    private WebApplication _app = null!;
    private McpClient _client = null!;

    public async Task InitializeAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services
            .AddSingleton(JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data")))
            .AddSingleton<IStore, MemoryStore>()
            .AddSingleton<IMessageBus, Bus>()
            .AddSingleton<IRealtimeNotifier, Notifier>()
            .AddSingleton<IHistoryReader, SimulatedHistoryReader>()
            .AddEvanApplication()
            .AddEvanMcp();
        _app = builder.Build();
        _app.MapEvanMcp();
        await _app.StartAsync();
        var http = _app.GetTestClient();
        var transport = new HttpClientTransport(new HttpClientTransportOptions { Endpoint = new Uri(http.BaseAddress!, DependencyInjection.Route) }, http, ownsHttpClient: false);
        _client = await McpClient.CreateAsync(transport);
    }

    public async Task DisposeAsync()
    {
        await _client.DisposeAsync();
        await _app.DisposeAsync();
    }

    [Fact]
    public async Task Le_serveur_expose_les_dix_outils_en_lecture_seule()
    {
        var tools = await _client.ListToolsAsync();
        // L'ordre de la liste n'est pas garanti par le protocole : on compare les noms.
        Assert.Equal(
            new[] { "alarmes", "arrets", "carnet_maintenance", "chronologie_panne", "diagnostic_defaut_repetitif", "energie", "etat_usine", "machines", "mesure", "organisation" },
            tools.Select(t => t.Name).Order(StringComparer.Ordinal));
        Assert.All(tools, t => Assert.True(t.ProtocolTool.Annotations?.ReadOnlyHint));
        Assert.Equal("Courbe d'une mesure", tools.Single(t => t.Name == "mesure").ProtocolTool.Title);
    }

    [Fact]
    public async Task Un_client_MCP_interroge_le_carnet_de_maintenance()
    {
        var resultat = await _client.CallToolAsync("carnet_maintenance", new Dictionary<string, object?> { ["usine"] = "Tours", ["machine"] = "R04" });
        Assert.NotEqual(true, resultat.IsError);
        var texte = string.Concat(resultat.Content.OfType<TextContentBlock>().Select(c => c.Text));
        Assert.Contains("Puissance UV", texte);
        Assert.Contains("derivesDetectees", texte);
    }
}
