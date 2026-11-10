using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace EVAN.Messaging;

public static class DependencyInjection
{
    /// <summary>
    /// Client MQTT partagé (section Evan:Mqtt). <paramref name="defaultClientId"/> sert si la configuration n'en donne pas ;
    /// <paramref name="configure"/> complète les réglages propres à l'hôte (message de dernière volonté de la passerelle…).
    /// </summary>
    public static IServiceCollection AddEvanMqtt(this IServiceCollection services, IConfiguration config, string defaultClientId, Action<MqttSettings>? configure = null)
    {
        var settings = new MqttSettings { ClientId = defaultClientId };
        config.GetSection("Evan:Mqtt").Bind(settings);
        configure?.Invoke(settings);
        services.AddSingleton(settings);
        services.AddSingleton(sp => new MqttConnection(sp.GetRequiredService<MqttSettings>(), sp.GetRequiredService<ILoggerFactory>().CreateLogger("Mqtt")));
        return services;
    }
}
