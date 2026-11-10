using System.Net.Http.Json;
using EVAN.Api.Endpoints;
using EVAN.Application;
using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Api.Tests;

/// <summary>
/// Les deux usines d'exemple (Tours, passerelle tours-01 ; Crissey, crissey-01) derrière les routes d'écriture, sur
/// un serveur de test. Le bus simulé garde chaque sujet publié : la preuve qu'une requête refusée n'est jamais partie
/// vers une passerelle.
/// </summary>
internal sealed class BancUsines : IAsyncDisposable
{
    public const string Tours = "site-tours";
    public const string Crissey = "site-crissey";
    /// <summary>Une machine de chaque usine.</summary>
    public const string MachineTours = "m-r01";
    public const string MachineCrissey = "m-cr-pp01";

    public sealed class Bus : IMessageBus
    {
        public readonly List<string> Sujets = new();
        public bool IsConnected => true;

        public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default)
        {
            lock (Sujets) Sujets.Add(topic);
            return Task.FromResult(true);
        }

        public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class
        {
            lock (Sujets) Sujets.Add(topic);
            var id = (request as ConnectionTestRequest)?.RequestId ?? "";
            return Task.FromResult((TReply?)(object)new ConnectionTestReply { RequestId = id, Ok = true, Steps = { new TestStep("Liaison simulée", true) } });
        }
    }

    public sealed class Notifier : IRealtimeNotifier
    {
        public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) => Task.CompletedTask;
        public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default) => Task.CompletedTask;
        public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default) => Task.CompletedTask;
        public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default) => Task.CompletedTask;
    }

    private readonly WebApplication _app;
    public readonly HttpClient Http;
    public readonly Bus Messages;
    public LiveService Live => _app.Services.GetRequiredService<LiveService>();

    private BancUsines(WebApplication app, Bus bus)
    {
        _app = app;
        Messages = bus;
        Http = app.GetTestClient();
        // Comme le front : toute écriture porte X-Evan (protection des écritures de UseEvanApi).
        Http.DefaultRequestHeaders.Add("X-Evan", "1");
    }

    public static async Task<BancUsines> DemarrerAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var bus = new Bus();
        var store = new MemoryStore();
        // L'API entière, avec la chaîne de requêtes de Program (cloisonnement, protection des écritures) : la démo y
        // reste ouverte sans compte, ce que ces routes d'écriture supposent.
        builder.Services
            .AddSingleton(Donnees())
            .AddSingleton<IStore>(store)
            .AddSingleton<IComptesStore>(store)
            .AddSingleton<IMessageBus>(bus)
            .AddSingleton<IHistoryReader, SimulatedHistoryReader>()
            .AddEvanApplication()
            .AddEvanApi(builder.Configuration);
        var app = builder.Build();
        app.UseEvanApi();
        await app.StartAsync();
        return new BancUsines(app, bus);
    }

    public static ReferenceData Donnees() => JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    /// <summary>Temps réel des deux usines, hors serveur (hub).</summary>
    public static LiveService LiveSeul() =>
        new(Donnees(), new MemoryStore(), new Notifier(), new Bus(), NullLogger<LiveService>.Instance);

    public Task<HttpResponseMessage> PostAsync(string chemin, object corps) => Http.PostAsJsonAsync(chemin, corps);

    public ValueTask DisposeAsync() => _app.DisposeAsync();
}
