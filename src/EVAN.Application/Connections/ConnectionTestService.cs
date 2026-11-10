using EVAN.Application.Abstractions;
using EVAN.Core.Contracts;

namespace EVAN.Application.Connections;

/// <summary>
/// Test de liaison d'une machine : le back ne joint jamais l'automate lui-même. Il demande à la passerelle
/// de l'usine (via MQTT, connexion sortante de la passerelle) de tester et attend sa réponse.
/// </summary>
public sealed class ConnectionTestService(IMessageBus bus)
{
    public async Task<ConnectionTestReply> TestAsync(string siteId, string gatewayId, string machineId, string protocole, Dictionary<string, string> parametres, CancellationToken ct)
    {
        var request = new ConnectionTestRequest
        {
            RequestId = Guid.NewGuid().ToString("N")[..12],
            MachineId = machineId,
            Protocole = protocole,
            Parametres = parametres,
        };
        if (!bus.IsConnected)
        {
            return new ConnectionTestReply { RequestId = request.RequestId, Ok = false, Steps = { new TestStep("Broker MQTT injoignable depuis le back", false) } };
        }
        var reply = await bus.RequestAsync<ConnectionTestRequest, ConnectionTestReply>(
            Topics.GatewayCommand(siteId, gatewayId, "test"),
            request,
            Topics.GatewayReply(siteId, gatewayId, request.RequestId),
            TimeSpan.FromSeconds(10),
            ct);
        return reply ?? new ConnectionTestReply
        {
            RequestId = request.RequestId,
            Ok = false,
            Steps = { new TestStep($"Aucune réponse de la passerelle « {gatewayId} » en 10 s (hors ligne ?)", false) },
        };
    }
}
