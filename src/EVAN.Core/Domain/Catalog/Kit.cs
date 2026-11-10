using System.Text.Json.Serialization;

namespace EVAN.Core.Domain.Catalog;

// ---------- Kit fourni (data/kit/machines.json), seuls les champs utiles ----------

public sealed class KitPoint
{
    [JsonPropertyName("numero")] public int Numero { get; init; }
    [JsonPropertyName("nom")] public string Nom { get; init; } = "";
    [JsonPropertyName("position")] public double[]? Position { get; init; }
    [JsonPropertyName("remonter_a_la_cause")] public string? Cause { get; init; }
    [JsonPropertyName("alarme_simulee")] public KitAlarme? Alarme { get; init; }
}

public sealed class KitAlarme
{
    [JsonPropertyName("code")] public string Code { get; init; } = "";
    [JsonPropertyName("message")] public string Message { get; init; } = "";
}

public sealed class KitMachine
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("nom")] public string Nom { get; init; } = "";
    [JsonPropertyName("points_diagnostic")] public List<KitPoint> Points { get; init; } = new();
}

public sealed class Kit
{
    [JsonPropertyName("machines")] public List<KitMachine> Machines { get; init; } = new();
}
