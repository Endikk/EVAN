namespace EVAN.Core.Contracts;

/// <summary>Alarme remontée directement par l'automate (Alarms &amp; Conditions OPC UA, journal S7, signal JMF).</summary>
public sealed class PlcAlarmMessage
{
    public string Schema { get; init; } = "evan.plc-alarm/1";
    public required string SiteId { get; init; }
    public required string MachineId { get; init; }
    public DateTimeOffset Ts { get; init; }
    public required string Code { get; init; }
    public int? Organe { get; init; }
    public bool Active { get; init; }
    public string? Message { get; init; }
}
