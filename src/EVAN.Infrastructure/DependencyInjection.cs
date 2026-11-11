using EVAN.Application.Abstractions;
using EVAN.Infrastructure.Assistant;
using EVAN.Infrastructure.Messaging;
using EVAN.Infrastructure.Persistence;
using EVAN.Infrastructure.Reference;
using EVAN.Infrastructure.Simulation;
using EVAN.Messaging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace EVAN.Infrastructure;

public static class DependencyInjection
{
    /// <summary>Données de référence (catalogue, kit, usine d'exemple) lues dans data/ ou Evan:DataDir.</summary>
    public static IServiceCollection AddEvanReferenceData(this IServiceCollection services, IConfiguration config)
    {
        services.AddSingleton(_ => JsonReferenceData.Load(config["Evan:DataDir"]));
        return services;
    }

    /// <summary>
    /// Ports du back : bus MQTT, persistance TimescaleDB (ou mémoire sans chaîne de connexion), ingestion, historique
    /// d'exploitation (simulé pour la démo, à l'identique du navigateur) et modèle de l'assistant.
    /// </summary>
    public static IServiceCollection AddEvanInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        services.AddEvanReferenceData(config);
        services.AddEvanMqtt(config, "evan-api");
        services.AddSingleton<IMessageBus, MqttMessageBus>();
        services.AddEvanPersistence(config);
        services.AddHostedService<MqttIngestionService>();
        services.AddSingleton<IHistoryReader, SimulatedHistoryReader>();
        services.AddEvanAssistant(config);
        return services;
    }

    private static IServiceCollection AddEvanPersistence(this IServiceCollection services, IConfiguration config)
    {
        var cs = config.GetConnectionString("Evan");
        if (string.IsNullOrWhiteSpace(cs)) services.AddSingleton<IStore, MemoryStore>();
        else
        {
            services.AddSingleton<IStore>(sp => new PostgresStore(cs, sp.GetRequiredService<ILogger<PostgresStore>>()));
            // Carnet de maintenance dans la même base ; sans base, il reste dans la mémoire de CarnetService.
            services.AddSingleton<ICarnetStore>(sp => (ICarnetStore)sp.GetRequiredService<IStore>());
        }
        // Comptes et organisations : même stockage, même base.
        services.AddSingleton<IComptesStore>(sp => (IComptesStore)sp.GetRequiredService<IStore>());
        services.AddHostedService<StoreInitializer>();
        return services;
    }
}
