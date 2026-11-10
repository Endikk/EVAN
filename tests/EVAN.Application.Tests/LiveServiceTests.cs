using EVAN.Application.Abstractions;
using EVAN.Application.Live;
using EVAN.Core.Contracts;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Application.Tests;

public class LiveServiceTests
{
    private sealed class FakeBus : IMessageBus
    {
        public readonly List<(string Topic, object? Payload)> Published = new();
        public bool IsConnected => true;
        public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default)
        {
            Published.Add((topic, payload));
            return Task.FromResult(true);
        }
        public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class =>
            Task.FromResult<TReply?>(null);
    }

    private sealed class FakeNotifier : IRealtimeNotifier
    {
        public readonly List<Alarme> Alarms = new();
        public readonly List<DetectionTrace> Traces = new();
        public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) => Task.CompletedTask;
        public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default)
        {
            lock (Alarms) Alarms.Add(alarm);
            return Task.CompletedTask;
        }
        public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default) => Task.CompletedTask;
        public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default)
        {
            lock (Traces) Traces.Add(trace);
            return Task.CompletedTask;
        }
    }

    private static ReferenceData Data() => JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    [Fact]
    public async Task Panne_simulee_jusqu_a_l_alarme_critique_avec_trace_complete()
    {
        var data = Data();
        var bus = new FakeBus();
        var notifier = new FakeNotifier();
        var live = new LiveService(data, new MemoryStore(), notifier, bus, NullLogger<LiveService>.Instance);
        const string site = "site-tours";

        // Une machine qui n'a encore rien envoyé ne peut pas montrer de panne : elle n'est pas candidate.
        Assert.Null(await live.SimulateFaultAsync(site, "m-r01", 1));
        live.HandleState(new StateMessage { SiteId = site, MachineId = "m-r01", Ts = DateTimeOffset.UtcNow, Etat = "marche", Vitesse = 140, Facteur = 0.93 });

        var fault = await live.SimulateFaultAsync(site, "m-r01", 1);
        Assert.NotNull(fault);
        Assert.Contains(bus.Published, p => p.Topic == Topics.SimulatorCommand(site, "fault"));

        live.HandleState(new StateMessage { SiteId = site, MachineId = "m-r01", Ts = DateTimeOffset.UtcNow, Etat = "marche", Vitesse = 140, Facteur = 0.93 });
        var t0 = DateTimeOffset.UtcNow;
        foreach (var (v, i) in new[] { 180.0, 220, 250 }.Select((v, i) => (v, i)))
        {
            var ts = t0.AddSeconds(i);
            live.HandleTelemetry(new TelemetryMessage
            {
                SiteId = site,
                MachineId = "m-r01",
                Ts = ts,
                Metrics = new[] { new Metric("m-r01.o1.tension", v, "N") },
                Trace = new() { ["plc"] = ts.AddMilliseconds(8), ["gateway"] = ts.AddMilliseconds(258) },
            }, ts.AddMilliseconds(280));
        }
        await Task.Delay(100);

        Assert.Contains(notifier.Alarms, a => a.Code == "TB-101" && a.Gravite == "critique");
        var trace = notifier.Traces.Last();
        Assert.True(trace.Termine);
        var etapes = trace.Steps.Select(s => s.Etape).ToList();
        foreach (var e in new[] { "defaut", "capteur", "automate", "passerelle", "mqtt", "ingestion", "regles", "alarme", "signalr" }) Assert.Contains(e, etapes);

        var active = live.ActiveAlarms(site).Single(a => a.Gravite == "critique");
        await live.ResolveAsync(active.Id, "test");
        Assert.DoesNotContain(live.ActiveAlarms(site), a => a.MachineId == "m-r01");
        Assert.Contains(bus.Published, p => p.Topic == Topics.SimulatorCommand(site, "resolve"));
    }

    [Fact]
    public async Task Chaque_usine_a_son_propre_flux_et_ses_alarmes()
    {
        var data = Data();
        var bus = new FakeBus();
        var live = new LiveService(data, new MemoryStore(), new FakeNotifier(), bus, NullLogger<LiveService>.Instance);
        Assert.Equal(["site-tours", "site-crissey"], live.SiteIds);

        // Un point de Crissey avec un seuil d'alarme haut, franchi trois fois.
        var machine = data.Demo.Usine("site-crissey")!.Machines.First();
        var point = data.Model(machine).Points.First(p => p.Seuils.AlarmeHaut is not null);
        var t0 = DateTimeOffset.UtcNow;
        TelemetryMessage Hors(string siteId, int i) => new()
        {
            SiteId = siteId, MachineId = machine.Id, Ts = t0.AddSeconds(i), Metrics = [new Metric(point.Id, point.Seuils.AlarmeHaut!.Value * 1.5)],
        };
        // Adressée à Tours, la mesure est ignorée : une usine n'accepte que ses propres machines.
        for (var i = 0; i < 3; i++) live.HandleTelemetry(Hors("site-tours", i), t0);
        Assert.Empty(live.ActiveAlarms("site-tours"));
        for (var i = 0; i < 3; i++) live.HandleTelemetry(Hors("site-crissey", i), t0);
        Assert.Contains(live.ActiveAlarms("site-crissey"), a => a.MachineId == machine.Id && a.Gravite == "critique");
        Assert.Empty(live.ActiveAlarms("site-tours"));

        // La panne de démonstration vise une machine de l'usine demandée, et la commande part sur ses sujets.
        foreach (var m in data.Demo.Usine("site-crissey")!.Machines)
            live.HandleState(new StateMessage { SiteId = "site-crissey", MachineId = m.Id, Ts = DateTimeOffset.UtcNow, Etat = "marche", Vitesse = 100, Facteur = 0.9 });
        var fault = await live.SimulateFaultAsync("site-crissey", null, null);
        Assert.StartsWith("m-cr-", fault!.MachineId);
        Assert.Contains(bus.Published, p => p.Topic == Topics.SimulatorCommand("site-crissey", "fault"));
    }
}
