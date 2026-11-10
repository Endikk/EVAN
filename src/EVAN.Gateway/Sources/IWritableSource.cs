namespace EVAN.Gateway.Sources;

/// <summary>Écriture vers l'automate, accessible uniquement à travers le garde-fou <see cref="Security.WriteGuard"/>.</summary>
public interface IWritableSource
{
    Task WriteAsync(string machineId, string address, double value, CancellationToken ct);
}
