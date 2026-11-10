using EVAN.Application.Assistant;
using EVAN.Application.Comptes;
using EVAN.Application.Connections;
using EVAN.Application.Exploitation;
using EVAN.Application.Live;
using EVAN.Application.Usines;
using EVAN.Core.Domain.Exploitation;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace EVAN.Application;

public static class DependencyInjection
{
    /// <summary>
    /// Cas d'usage. Les ports (IStore, IComptesStore, IMotsDePasse, IMessageBus, IRealtimeNotifier, IHistoryReader,
    /// ReferenceData, et IChatClient pour l'assistant) sont fournis par l'infrastructure et l'API.
    /// </summary>
    public static IServiceCollection AddEvanApplication(this IServiceCollection services)
    {
        // Horloge et réglages du temps réel : l'hôte peut les remplacer (Evan:LiaisonPerdueSecondes), sinon valeurs par défaut.
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton(new LiveOptions());
        services.AddSingleton<LiveService>();
        services.AddSingleton<ConnectionTestService>();
        services.AddSingleton<Energie>();
        services.AddSingleton<CarnetService>();
        services.AddSingleton<ExploitationService>();
        services.AddSingleton<EvanTools>();
        services.AddSingleton<AssistantService>();
        services.AddSingleton<ComptesService>();
        services.AddSingleton<UsinesService>();
        return services;
    }
}
