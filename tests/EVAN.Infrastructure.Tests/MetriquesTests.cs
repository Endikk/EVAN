using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using System.Text.Json;
using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Application.Observabilite;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Infrastructure.Messaging;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using EVAN.Messaging;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Infrastructure.Tests;

/// <summary>Les mesures sont statiques : ces tests tournent seuls, aucun autre test ne compte en même temps qu'eux.</summary>
[CollectionDefinition(nameof(MesuresSeules), DisableParallelization = true)]
public sealed class MesuresSeules;

/// <summary>
/// Mesures métier « EVAN » le long de la chaîne réelle : message MQTT reçu par l'ingestion, alarme automate levée puis
/// close par le cas d'usage temps réel, messages écartés.
/// </summary>
[Collection(nameof(MesuresSeules))]
public sealed class MetriquesTests : IDisposable
{
    private const string Site = "site-tours";
    private const string Machine = "m-r01";

    private readonly MeterListener _ecoute = new();
    private readonly ConcurrentDictionary<string, long> _sommes = new();

    public MetriquesTests()
    {
        _ecoute.InstrumentPublished = (instrument, ecoute) =>
        {
            if (instrument.Meter.Name == Metriques.Nom) ecoute.EnableMeasurementEvents(instrument);
        };
        _ecoute.SetMeasurementEventCallback<long>((instrument, valeur, etiquettes, _) =>
        {
            var cle = instrument.Name + string.Concat(etiquettes.ToArray().OrderBy(e => e.Key).Select(e => $"|{e.Key}={e.Value}"));
            _sommes.AddOrUpdate(cle, valeur, (_, somme) => somme + valeur);
        });
        _ecoute.Start();
    }

    public void Dispose() => _ecoute.Dispose();

    private long Somme(string cle) => _sommes.GetValueOrDefault(cle);

    private sealed class Diffusion : IRealtimeNotifier
    {
        public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) => Task.CompletedTask;
        public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default) => Task.CompletedTask;
        public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default) => Task.CompletedTask;
        public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default) => Task.CompletedTask;
    }

    private sealed class Bus : IMessageBus
    {
        public bool IsConnected => true;
        public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default) => Task.FromResult(true);
        public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class =>
            Task.FromResult<TReply?>(null);
    }

    private static byte[] Json<T>(T message) => JsonSerializer.SerializeToUtf8Bytes(message, Core.Contracts.Json.Options);

    private static byte[] Automate(bool active) =>
        Json(new PlcAlarmMessage { SiteId = Site, MachineId = Machine, Ts = DateTimeOffset.UtcNow, Code = "AU-7", Active = active });

    [Fact]
    public async Task Messages_recus_alarmes_levees_et_ouvertes_suivent_la_chaine_d_ingestion()
    {
        var data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));
        await using var live = new LiveService(data, new MemoryStore(), new Diffusion(), new Bus(), NullLogger<LiveService>.Instance);
        var ingestion = new MqttIngestionService(new MqttConnection(new MqttSettings(), NullLogger.Instance), live, NullLogger<MqttIngestionService>.Instance);
        var maintenant = DateTimeOffset.UtcNow;

        ingestion.Traiter(Topics.PlcAlarm(Site, Machine), Automate(active: true), maintenant);

        Assert.Equal(1, Somme("evan.mqtt.messages|type=alarm"));
        Assert.Equal(1, Somme("evan.alarmes.levees|gravite=critique|regle=automate"));
        Assert.Equal(1, Somme("evan.alarmes.ouvertes|gravite=critique"));

        ingestion.Traiter(Topics.PlcAlarm(Site, Machine), Automate(active: false), maintenant);

        Assert.Equal(2, Somme("evan.mqtt.messages|type=alarm"));
        Assert.Equal(1, Somme("evan.alarmes.levees|gravite=critique|regle=automate"));
        Assert.Equal(0, Somme("evan.alarmes.ouvertes|gravite=critique"));
    }

    [Fact]
    public async Task Un_message_illisible_ou_hors_de_son_sujet_est_compte_comme_ecarte()
    {
        var data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));
        await using var live = new LiveService(data, new MemoryStore(), new Diffusion(), new Bus(), NullLogger<LiveService>.Instance);
        var ingestion = new MqttIngestionService(new MqttConnection(new MqttSettings(), NullLogger.Instance), live, NullLogger<MqttIngestionService>.Instance);
        var maintenant = DateTimeOffset.UtcNow;

        ingestion.Traiter(Topics.Telemetry(Site, Machine), "{pas du json"u8, maintenant);
        // Publié sur le sujet de m-r02, le message prétend venir de m-r01.
        ingestion.Traiter(Topics.PlcAlarm(Site, "m-r02"), Automate(active: true), maintenant);
        // Type inconnu : compté sous « autre », jamais sous son nom (un sujet forgé ne crée pas de série).
        ingestion.Traiter($"evan/v1/{Site}/{Machine}/inconnu-{Guid.NewGuid():N}", "{}"u8, maintenant);

        Assert.Equal(1, Somme("evan.mqtt.messages.rejetes|motif=json"));
        Assert.Equal(1, Somme("evan.mqtt.messages.rejetes|motif=incoherent"));
        Assert.Equal(1, Somme("evan.mqtt.messages|type=autre"));
        Assert.Equal(0, Somme("evan.alarmes.levees|gravite=critique|regle=automate"));
        Assert.DoesNotContain(_sommes.Keys, k => k.Contains("inconnu-", StringComparison.Ordinal));
    }
}
