using EVAN.Core.Contracts;

namespace EVAN.Gateway.Sources;

/// <summary>Reçoit les échantillons lus sur les machines (file vers MQTT).</summary>
public interface ISampleSink
{
    void Push(string machineId, Metric metric);
    void State(string machineId, string etat, double? vitesse = null);
    void Alarm(PlcAlarmMessage alarm);
    /// <summary>Liaison perdue avec la machine : son dernier état n'est plus republié, le back la passe hors ligne faute de nouvelles.</summary>
    void Lost(string machineId);
}
