namespace EVAN.Core.Contracts;

// ---------- Échanges back ⇄ passerelle : présence, test de liaison, écriture ----------

public sealed record GatewayStatus(string GatewayId, string Status, DateTimeOffset Ts, string? Version = null, int Connections = 0);

public sealed class ConnectionTestRequest
{
    public required string RequestId { get; init; }
    public required string MachineId { get; init; }
    public required string Protocole { get; init; }
    public Dictionary<string, string> Parametres { get; init; } = new();
}

public sealed record TestStep(string Label, bool Ok, double? Ms = null);

public sealed record BrowsedVariable(string Id, string Nom, string Type);

public sealed class ConnectionTestReply
{
    public required string RequestId { get; init; }
    public bool Ok { get; init; }
    public List<TestStep> Steps { get; init; } = new();
    public List<BrowsedVariable> Variables { get; init; } = new();
}

/// <summary>Demande d'écriture vers un automate : refusée sauf autorisation explicite et journalisée.</summary>
public sealed class WriteCommand
{
    public required string RequestId { get; init; }
    public required string MachineId { get; init; }
    public required string Address { get; init; }
    public required double Value { get; init; }
    public required string Operator { get; init; }
    public required string Reason { get; init; }
}
