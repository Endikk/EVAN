namespace EVAN.Application.Abstractions;

/// <summary>Bus de messages vers les passerelles et le simulateur (implémenté en MQTT dans l'infrastructure).</summary>
public interface IMessageBus
{
    bool IsConnected { get; }
    Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default);
    /// <summary>Requête/réponse : publie sur <paramref name="topic"/> et attend un message sur <paramref name="replyTopic"/>.</summary>
    Task<TReply?> RequestAsync<TRequest, TReply>(string topic, TRequest request, string replyTopic, TimeSpan timeout, CancellationToken ct = default)
        where TReply : class;
}
