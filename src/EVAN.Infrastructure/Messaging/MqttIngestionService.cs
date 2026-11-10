using System.Collections.Concurrent;
using System.Text.Json;
using EVAN.Application.Live;
using EVAN.Application.Observabilite;
using EVAN.Core.Contracts;
using EVAN.Messaging;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EVAN.Infrastructure.Messaging;

/// <summary>
/// Ingestion : s'abonne à evan/v1/+/+/+ et transmet télémétrie, états et alarmes automate au cas d'usage temps réel,
/// ainsi que la présence des passerelles (evan/v1/+/gateway/+/status, hors du premier filtre).
/// L'horodatage de réception sert à mesurer la latence de bout en bout et à détecter une liaison perdue.
/// Chaque message est compté par type (evan.mqtt.messages), chaque message écarté par motif (evan.mqtt.messages.rejetes).
/// </summary>
public sealed class MqttIngestionService(MqttConnection mqtt, LiveService live, ILogger<MqttIngestionService> log) : BackgroundService
{
    /// <summary>Sujets déjà signalés pour un contenu incohérent : un seul avertissement par sujet, en nombre borné.</summary>
    private readonly ConcurrentDictionary<string, byte> _incoherents = new();
    private const int IncoherentsSignalesMax = 1000;

    /// <summary>
    /// Le contenu doit annoncer l'usine et la machine de son sujet. L'ACL de Mosquitto limite une passerelle aux sujets
    /// de son usine, pas à ce qu'elle écrit dedans : sans ce contrôle, une passerelle compromise ou mal configurée
    /// fausserait l'état et les alarmes d'une autre usine.
    /// </summary>
    internal static bool Coherent(string siteSujet, string machineSujet, string site, string machine) =>
        string.Equals(siteSujet, site, StringComparison.Ordinal) && string.Equals(machineSujet, machine, StringComparison.Ordinal);

    private bool Accepte(string topic, string siteSujet, string machineSujet, string site, string machine)
    {
        if (Coherent(siteSujet, machineSujet, site, machine)) return true;
        Metriques.MessageMqttRejete("incoherent");
        if (_incoherents.Count < IncoherentsSignalesMax && _incoherents.TryAdd(topic, 0))
            log.LogWarning("Message ignoré sur {Topic} : il annonce {Site}/{Machine}, différent de son sujet", topic, site, machine);
        return false;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        mqtt.Subscribe(Topics.IngestFilter);
        mqtt.Subscribe(Topics.GatewayStatusFilter);
        mqtt.MessageReceived += (topic, payload) =>
        {
            Traiter(topic, payload.Span, DateTimeOffset.UtcNow);
            return Task.CompletedTask;
        };
        await mqtt.StartAsync(stoppingToken);
        await Task.Delay(Timeout.Infinite, stoppingToken).ContinueWith(_ => { });
    }

    /// <summary>Un message reçu : présence d'une passerelle, télémétrie, état ou alarme automate, selon son sujet.</summary>
    internal void Traiter(string topic, ReadOnlySpan<byte> payload, DateTimeOffset received)
    {
        try
        {
            if (Topics.TryParseGatewayStatus(topic, out var site, out var gateway))
            {
                Metriques.MessageMqtt("gateway");
                if (JsonSerializer.Deserialize<GatewayStatus>(payload, Json.Options) is { Status: { } status }) live.HandleGatewayStatus(site, gateway, status, received);
                return;
            }
            if (!Topics.TryParse(topic, out var siteSujet, out var machine, out var kind) || machine == "gateway") return;
            Metriques.MessageMqtt(kind);
            switch (kind)
            {
                case "telemetry":
                    if (JsonSerializer.Deserialize<TelemetryMessage>(payload, Json.Options) is { } t && Accepte(topic, siteSujet, machine, t.SiteId, t.MachineId))
                        live.HandleTelemetry(t, received);
                    break;
                case "state":
                    if (JsonSerializer.Deserialize<StateMessage>(payload, Json.Options) is { } s && Accepte(topic, siteSujet, machine, s.SiteId, s.MachineId))
                        live.HandleState(s, received);
                    break;
                case "alarm":
                    if (JsonSerializer.Deserialize<PlcAlarmMessage>(payload, Json.Options) is { } a && Accepte(topic, siteSujet, machine, a.SiteId, a.MachineId))
                        live.HandlePlcAlarm(a);
                    break;
            }
        }
        catch (JsonException ex)
        {
            Metriques.MessageMqttRejete("json");
            log.LogWarning("Message invalide sur {Topic} : {Message}", topic, ex.Message);
        }
    }
}
