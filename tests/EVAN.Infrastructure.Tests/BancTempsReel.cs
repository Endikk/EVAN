using System.Buffers;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Application.Usines;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Machines;
using EVAN.Infrastructure.Messaging;
using EVAN.Infrastructure.Reference;
using EVAN.Messaging;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit.Abstractions;

namespace EVAN.Infrastructure.Tests;

/// <summary>Banc de performance : ne tourne qu'avec EVAN_BANC=1, ignoré par un dotnet test ordinaire.</summary>
public sealed class BancAttribute : FactAttribute
{
    public BancAttribute()
    {
        if (Environment.GetEnvironmentVariable("EVAN_BANC") != "1") Skip = "Banc de performance : lancer avec EVAN_BANC=1, en Release.";
    }
}

/// <summary>
/// Banc du chemin chaud du temps réel, reproductible hors Docker :
/// <c>EVAN_BANC=1 dotnet test tests/EVAN.Infrastructure.Tests -c Release --filter "FullyQualifiedName~Banc" --logger "console;verbosity=detailed"</c>
/// Les messages sont ceux que publie le simulateur (toutes les machines des usines d'exemple, un lot par seconde
/// simulée) ; ils passent par l'ingestion MQTT (sujet, JSON, règles, état temps réel), puis le lot SignalR de chaque
/// usine est sérialisé comme par le hub. Deux régimes : démarrage (aucune alarme en mémoire) et longue durée (le
/// plafond de 2000 alarmes closes gardées par usine, atteint après quelques jours de marche).
/// </summary>
public class BancTempsReel(ITestOutputHelper sortie)
{
    private const int Secondes = 1000;
    private const int Chauffe = 200;

    /// <summary>Options du protocole JSON de SignalR telles que l'API les règle (nuls omis).</summary>
    private static readonly JsonSerializerOptions Hub = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull };

    private static ReferenceData Data() => JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    private sealed class Horloge(DateTimeOffset debut) : TimeProvider
    {
        public DateTimeOffset Maintenant = debut;
        public override DateTimeOffset GetUtcNow() => Maintenant;
    }

    private sealed class StockageNul : IStore
    {
        public string Kind => "nul";
        public bool Healthy => true;
        public Task InitializeAsync(ReferenceData data, CancellationToken ct) => Task.CompletedTask;
        public void Enqueue(IEnumerable<MeasurementRow> rows) { }
        public Task SaveAlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveEventAsync(string siteId, Evenement e, CancellationToken ct = default) => Task.CompletedTask;
        public Task SaveMachineStateAsync(string machineId, string etat, double vitesse, DateTimeOffset t, CancellationToken ct = default) => Task.CompletedTask;
        public Task<IReadOnlyList<Alarme>> AlarmsAsync(string siteId, DateTimeOffset from, DateTimeOffset to, string? machineId, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Alarme>>([]);
        public Task<IReadOnlyList<Alarme>> UnresolvedAlarmsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Alarme>>([]);
        public Task<IReadOnlyList<SeriesPoint>> SeriesAsync(string pointId, DateTimeOffset from, DateTimeOffset to, TimeSpan bucket, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<SeriesPoint>>([]);
        public Task<IReadOnlyList<Evenement>> EventsAsync(string siteId, DateTimeOffset from, CancellationToken ct = default) => Task.FromResult<IReadOnlyList<Evenement>>([]);
        public Task<IReadOnlyList<UsineEnregistree>> UsinesAsync(CancellationToken ct = default) => Task.FromResult<IReadOnlyList<UsineEnregistree>>([]);
        public Task EnregistrerUsineAsync(UsineEnregistree usine, CancellationToken ct = default) => Task.CompletedTask;
        public bool IsPermanentFailure(Exception ex) => false;
    }

    private sealed class DiffusionNulle : IRealtimeNotifier
    {
        public int Alarmes;
        public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) => Task.CompletedTask;
        public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default)
        {
            Interlocked.Increment(ref Alarmes);
            return Task.CompletedTask;
        }
        public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default) => Task.CompletedTask;
        public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default) => Task.CompletedTask;
    }

    /// <summary>Valeur dans la plage normale : nominale et petite oscillation, arrondie comme le simulateur.</summary>
    private static double Valeur(PointDeMesure p, int seconde, int rang) => Math.Round(p.Nominal * (1 + 0.0005 * Math.Sin(seconde * 0.7 + rang)), 4);

    /// <summary>Lots de messages MQTT (sujet, JSON), un par seconde simulée : télémétrie puis état de chaque machine.</summary>
    private static List<(string Topic, byte[] Json)[]> Messages(ReferenceData data, DateTimeOffset debut, int secondes)
    {
        var machines = data.Demo.Usines.SelectMany(u => u.Machines.Select(m => (Site: u.Site.Id, Model: data.Model(m)))).ToList();
        var lots = new List<(string, byte[])[]>(secondes);
        long seq = 0;
        for (var s = 0; s < secondes; s++)
        {
            var now = debut.AddSeconds(s);
            var lot = new List<(string, byte[])>();
            foreach (var (site, model) in machines)
            {
                var id = model.Machine.Id;
                var t = new TelemetryMessage
                {
                    SiteId = site,
                    MachineId = id,
                    GatewayId = "simulateur",
                    Seq = ++seq,
                    Ts = now,
                    Metrics = model.Points.Select((p, i) => new Metric(p.Id, Valeur(p, s, i), p.Unite)).ToList(),
                    Trace = new() { ["plc"] = now, ["gateway"] = now.AddMilliseconds(3) },
                };
                var e = new StateMessage { SiteId = site, MachineId = id, Ts = now, Etat = "marche", Vitesse = 140 + s % 7, Facteur = 0.93, Bonnes = 1000 + s, Gache = 15 };
                lot.Add((Topics.Telemetry(site, id), JsonSerializer.SerializeToUtf8Bytes(t, Json.Options)));
                lot.Add((Topics.State(site, id), JsonSerializer.SerializeToUtf8Bytes(e, Json.Options)));
            }
            lots.Add(lot.ToArray());
        }
        return lots;
    }

    /// <summary>
    /// Remplit le journal d'alarmes de chaque usine jusqu'au plafond : une alerte « attention » levée puis close par
    /// hystérésis, encore et encore, sur un point de chaque usine.
    /// </summary>
    private static void RemplirAlarmes(ReferenceData data, LiveService live, Horloge horloge)
    {
        foreach (var usine in data.Demo.Usines)
        {
            var point = usine.Machines.SelectMany(m => data.Model(m).Points)
                .First(p => p.Seuils is { AttentionHaut: { } th, AlarmeHaut: { } ah } && ah > th && p.Nominal < th);
            var attention = (point.Seuils.AttentionHaut!.Value + point.Seuils.AlarmeHaut!.Value) / 2;
            for (var i = 0; i < 2100; i++)
            {
                foreach (var v in new[] { attention, point.Nominal, point.Nominal, point.Nominal })
                {
                    horloge.Maintenant = horloge.Maintenant.AddMilliseconds(50);
                    live.HandleTelemetry(new TelemetryMessage
                    {
                        SiteId = usine.Site.Id,
                        MachineId = point.MachineId,
                        Ts = horloge.Maintenant,
                        Metrics = [new Metric(point.Id, v)],
                    }, horloge.Maintenant);
                }
            }
        }
    }

    private void Mesurer(string? regime, bool longueDuree)
    {
        var data = Data();
        var debut = DateTimeOffset.UtcNow;
        var horloge = new Horloge(debut);
        var diffusion = new DiffusionNulle();
        var live = new LiveService(data, new StockageNul(), diffusion, new LiveServiceBus(), NullLogger<LiveService>.Instance, time: horloge);
        var mqtt = new MqttConnection(new MqttSettings(), NullLogger.Instance);
        var ingestion = new MqttIngestionService(mqtt, live, NullLogger<MqttIngestionService>.Instance);
        if (longueDuree) RemplirAlarmes(data, live, horloge);
        var alarmesEnMemoire = live.SiteIds.Sum(s => live.Direct(s)!.Alarmes.Count);
        var depart = horloge.Maintenant;
        var lots = Messages(data, depart, Secondes);
        var tampon = new ArrayBufferWriter<byte>(64 * 1024);
        long messages = 0, octetsSignalR = 0, envois = 0;
        long alloc0 = 0;
        var gc0 = 0;
        var chrono = new Stopwatch();
        var alarmesAvant = 0;
        for (var s = 0; s < Secondes; s++)
        {
            if (s == Chauffe)
            {
                GC.Collect();
                GC.WaitForPendingFinalizers();
                alarmesAvant = diffusion.Alarmes;
                alloc0 = GC.GetTotalAllocatedBytes(true);
                gc0 = GC.CollectionCount(0);
                chrono.Start();
            }
            horloge.Maintenant = depart.AddSeconds(s).AddMilliseconds(5);
            foreach (var (topic, json) in lots[s])
            {
                ingestion.Traiter(topic, json, horloge.Maintenant);
                if (s >= Chauffe) messages++;
            }
            foreach (var site in live.SiteIds)
            {
                if (live.TakeTelemetry(site) is not { } lot) continue;
                tampon.Clear();
                using (var w = new Utf8JsonWriter(tampon))
                {
                    JsonSerializer.Serialize(w, new { values = (IReadOnlyDictionary<string, PointLive>)lot.Values, machines = (IReadOnlyDictionary<string, MachineLive>)lot.Machines }, Hub);
                }
                if (s >= Chauffe)
                {
                    octetsSignalR += tampon.WrittenCount;
                    envois++;
                }
            }
        }
        chrono.Stop();
        var alloc = GC.GetTotalAllocatedBytes(true) - alloc0;
        var gc = GC.CollectionCount(0) - gc0;
        if (regime is null) return;
        sortie.WriteLine($"{regime} : {alarmesEnMemoire} alarmes en mémoire, {messages} messages en {chrono.Elapsed.TotalMilliseconds:0} ms");
        sortie.WriteLine($"  par message : {chrono.Elapsed.TotalMicroseconds / messages:0.0} µs, {alloc / messages:0} octets alloués ; GC gen0 : {gc}");
        sortie.WriteLine($"  lot SignalR : {octetsSignalR / Math.Max(1, envois)} octets par usine et par seconde ; alarmes levées pendant la mesure : {diffusion.Alarmes - alarmesAvant}");
    }

    private sealed class LiveServiceBus : IMessageBus
    {
        public bool IsConnected => true;
        public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default) => Task.FromResult(true);
        public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class =>
            Task.FromResult<TReply?>(null);
    }

    [Banc]
    public void Banc_ingestion_regles_et_lot_signalr()
    {
        // Premier passage non compté : compilation à la volée et montée en régime du JIT.
        Mesurer(null, longueDuree: false);
        Mesurer("Démarrage", longueDuree: false);
        Mesurer("Longue durée", longueDuree: true);
    }

    [Banc]
    public void Banc_moteur_de_regles()
    {
        var data = Data();
        var points = data.Demo.Usines.SelectMany(u => u.Machines).Select(data.Model).SelectMany(m => m.Points).ToList();
        var contexte = new ContexteNul(data);
        var moteur = new RulesEngine(contexte);
        const int tours = 2000;
        for (var s = 0; s < 200; s++)
        {
            for (var i = 0; i < points.Count; i++) moteur.Evaluate(points[i], Valeur(points[i], s, i), s * 1000L, true);
        }
        GC.Collect();
        var alloc0 = GC.GetTotalAllocatedBytes(true);
        var chrono = Stopwatch.StartNew();
        for (var s = 200; s < 200 + tours; s++)
        {
            for (var i = 0; i < points.Count; i++) moteur.Evaluate(points[i], Valeur(points[i], s, i), s * 1000L, true);
        }
        chrono.Stop();
        var n = (long)tours * points.Count;
        sortie.WriteLine($"Moteur de règles : {points.Count} points, {n} évaluations, {chrono.Elapsed.TotalNanoseconds / n:0} ns et {(GC.GetTotalAllocatedBytes(true) - alloc0) / (double)n:0.0} octets par évaluation ; alarmes : {contexte.Alarmes}");
    }

    [Banc]
    public void Banc_lecture_json_telemetrie()
    {
        var data = Data();
        var lots = Messages(data, DateTimeOffset.UtcNow, 50);
        var telemetrie = lots.SelectMany(l => l).Where(m => m.Topic.EndsWith("/telemetry", StringComparison.Ordinal)).Select(m => m.Json).ToList();
        foreach (var json in telemetrie) JsonSerializer.Deserialize<TelemetryMessage>(json, Json.Options);
        GC.Collect();
        var alloc0 = GC.GetTotalAllocatedBytes(true);
        var chrono = Stopwatch.StartNew();
        const int tours = 20;
        for (var r = 0; r < tours; r++)
        {
            foreach (var json in telemetrie) JsonSerializer.Deserialize<TelemetryMessage>(json, Json.Options);
        }
        chrono.Stop();
        var n = tours * telemetrie.Count;
        sortie.WriteLine($"Lecture JSON de la télémétrie : {telemetrie.Average(j => j.Length):0} octets par message, {chrono.Elapsed.TotalMicroseconds / n:0.0} µs et {(GC.GetTotalAllocatedBytes(true) - alloc0) / n:0} octets alloués par message");
    }

    private sealed class ContexteNul(ReferenceData data) : RulesEngine.IContext
    {
        private readonly Dictionary<string, (MesureDef, OrganeCatalogue)> _defs = data.Demo.Usines.SelectMany(u => u.Machines).Select(data.Model).SelectMany(m => m.Defs).ToDictionary(x => x.Key, x => x.Value);
        public int Alarmes;
        public Organe? Organe(PointDeMesure point) => null;
        public (MesureDef Mesure, OrganeCatalogue Organe)? Def(PointDeMesure point) => _defs.TryGetValue(point.Id, out var d) ? d : null;
        public int CountRecent(string machineId, string code, long since) => 0;
        public void Emit(Alarme alarm, string kind) => Alarmes++;
    }
}
