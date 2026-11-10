using EVAN.Application.Abstractions;
using EVAN.Application.Assistant;
using EVAN.Application.Exploitation;
using EVAN.Application.Live;
using EVAN.Core.Domain.Alarms;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;
using Microsoft.Extensions.Logging.Abstractions;

namespace EVAN.Infrastructure.Tests.Assistant;

/// <summary>
/// L'organisation d'exemple figée à un instant : historique simulé (le même que celui du navigateur), aucun direct, bus
/// et diffusion inertes. Les outils de l'assistant y répondent toujours la même chose.
/// </summary>
internal sealed class UsineFigee
{
    public static readonly ReferenceData Data = JsonReferenceData.Load(Path.Combine(AppContext.BaseDirectory, "data"));

    private sealed class Bus : IMessageBus
    {
        public bool IsConnected => true;
        public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default) => Task.FromResult(true);
        public Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default) where TReply : class =>
            Task.FromResult<TReply?>(null);
    }

    private sealed class Diffusion : IRealtimeNotifier
    {
        public Task TelemetryAsync(string siteId, IReadOnlyDictionary<string, PointLive> values, IReadOnlyDictionary<string, MachineLive> machines, CancellationToken ct = default) => Task.CompletedTask;
        public Task AlarmAsync(string siteId, Alarme alarm, CancellationToken ct = default) => Task.CompletedTask;
        public Task EventAsync(string siteId, Evenement e, CancellationToken ct = default) => Task.CompletedTask;
        public Task TraceAsync(string siteId, DetectionTrace trace, CancellationToken ct = default) => Task.CompletedTask;
    }

    public UsineFigee(long maintenant)
    {
        Maintenant = maintenant;
        var live = new LiveService(Data, new MemoryStore(), new Diffusion(), new Bus(), NullLogger<LiveService>.Instance);
        Exploitation = new ExploitationService(Data, new SimulatedHistoryReader(Data), live, new CarnetService(live), new Energie(Data)) { Horloge = () => maintenant };
        Outils = new EvanTools(Exploitation);
    }

    public long Maintenant { get; }
    public ExploitationService Exploitation { get; }
    public EvanTools Outils { get; }
}
