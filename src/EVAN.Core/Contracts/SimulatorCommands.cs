namespace EVAN.Core.Contracts;

// ---------- Commandes de démonstration envoyées au simulateur ----------

public sealed record FaultCommand(string MachineId, int OrganeNumero, string? RequestedBy = null);

public sealed record ResolveCommand(string MachineId);
