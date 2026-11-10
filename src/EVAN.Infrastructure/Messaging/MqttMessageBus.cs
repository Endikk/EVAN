using System.Collections.Concurrent;
using System.Text.Json;
using EVAN.Application.Abstractions;
using EVAN.Core.Contracts;
using EVAN.Messaging;
using Microsoft.Extensions.Logging;

namespace EVAN.Infrastructure.Messaging;

/// <summary>Port <see cref="IMessageBus"/> sur MQTT, avec requête/réponse par sujet de retour dédié.</summary>
public sealed class MqttMessageBus : IMessageBus
{
    private readonly MqttConnection _mqtt;
    private readonly ILogger<MqttMessageBus> _log;
    private readonly ConcurrentDictionary<string, TaskCompletionSource<byte[]>> _pending = new();

    public MqttMessageBus(MqttConnection mqtt, ILogger<MqttMessageBus> log)
    {
        _mqtt = mqtt;
        _log = log;
        _mqtt.Subscribe(Topics.GatewayFilter);
        _mqtt.MessageReceived += (topic, payload) =>
        {
            if (_pending.TryRemove(topic, out var tcs)) tcs.TrySetResult(payload.ToArray());
            return Task.CompletedTask;
        };
    }

    public bool IsConnected => _mqtt.IsConnected;

    public Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default) =>
        _mqtt.PublishAsync(topic, payload, retain, ct);

    /// <summary>Pas de réponse dans le délai, ou réponse illisible : null (l'appelant en fait un échec, pas une erreur 500).</summary>
    public async Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default)
        where TReply : class
    {
        var tcs = new TaskCompletionSource<byte[]>(TaskCreationOptions.RunContinuationsAsynchronously);
        _pending[replyTopic] = tcs;
        try
        {
            if (!await _mqtt.PublishAsync(topic, request, false, ct)) return null;
            // WaitAsync libère son minuteur dès la réponse, contrairement à un Task.Delay laissé courir.
            var raw = await tcs.Task.WaitAsync(timeout, ct);
            return JsonSerializer.Deserialize<TReply>(raw, Json.Options);
        }
        catch (TimeoutException)
        {
            return null;
        }
        catch (JsonException ex)
        {
            _log.LogWarning("Réponse illisible sur {Topic} : {Message}", replyTopic, ex.Message);
            return null;
        }
        finally
        {
            _pending.TryRemove(replyTopic, out _);
        }
    }
}
