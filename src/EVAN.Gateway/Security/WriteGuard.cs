using System.Text.Json;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;

namespace EVAN.Gateway.Security;

/// <summary>
/// Garde-fou des écritures vers les automates. Par défaut tout est refusé (passerelle en lecture seule).
/// Une écriture n'est permise que si l'administrateur l'a activée sur la passerelle ET que la demande
/// nomme un opérateur et une raison. Chaque demande, acceptée ou refusée, est journalisée (fichier append-only).
/// </summary>
public sealed class WriteGuard(GatewayOptions options, ILogger<WriteGuard> log)
{
    private readonly SemaphoreSlim _lock = new(1, 1);

    public async Task<(bool Allowed, string Reason)> AuthorizeAsync(WriteCommand cmd, CancellationToken ct)
    {
        var (allowed, reason) = !options.AllowWrites
            ? (false, "Passerelle en lecture seule (Gateway:AllowWrites = false)")
            : string.IsNullOrWhiteSpace(cmd.Operator) || cmd.Reason.Trim().Length < 8
                ? (false, "Opérateur et raison obligatoires")
                : (true, "Autorisée");
        await AuditAsync(cmd, allowed ? "autorisee" : "refusee", reason, ct);
        if (!allowed) log.LogWarning("Écriture refusée sur {Machine} {Address} : {Reason}", cmd.MachineId, cmd.Address, reason);
        return (allowed, reason);
    }

    public Task AuditResultAsync(WriteCommand cmd, string statut, string detail, CancellationToken ct) => AuditAsync(cmd, statut, detail, ct);

    private async Task AuditAsync(WriteCommand cmd, string statut, string detail, CancellationToken ct)
    {
        var line = JsonSerializer.Serialize(new
        {
            ts = DateTimeOffset.UtcNow,
            gateway = options.GatewayId,
            cmd.RequestId,
            cmd.MachineId,
            cmd.Address,
            cmd.Value,
            cmd.Operator,
            cmd.Reason,
            statut,
            detail,
        }, Json.Options);
        await _lock.WaitAsync(ct);
        try
        {
            var dir = Path.GetDirectoryName(Path.GetFullPath(options.AuditFile));
            if (dir is not null) Directory.CreateDirectory(dir);
            await File.AppendAllTextAsync(options.AuditFile, line + Environment.NewLine, ct);
        }
        finally
        {
            _lock.Release();
        }
    }
}
