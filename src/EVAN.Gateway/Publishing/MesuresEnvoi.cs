using System.Diagnostics.Metrics;

namespace EVAN.Gateway.Publishing;

/// <summary>
/// Mesures de la passerelle, sous le nom « EVAN.Passerelle » (System.Diagnostics.Metrics) : messages en attente du
/// broker et messages perdus. Une file qui grossit dit que le broker ne répond plus, avant que la file pleine ne fasse
/// perdre des mesures. Exportées en OpenTelemetry si un collecteur est désigné, lisibles sinon par dotnet-counters.
/// </summary>
internal static class MesuresEnvoi
{
    public const string Nom = "EVAN.Passerelle";

    private static readonly Meter Meter = new(Nom, typeof(MesuresEnvoi).Assembly.GetName().Version?.ToString());

    private static readonly UpDownCounter<long> EnFile =
        Meter.CreateUpDownCounter<long>("evan.passerelle.file", "{message}", "Messages en attente d'envoi ou d'accusé du broker");

    private static readonly Counter<long> Perdus =
        Meter.CreateCounter<long>("evan.passerelle.perdus", "{message}", "Messages abandonnés : file pleine ou refus répété du broker");

    /// <summary>Messages entrés dans la file (positif) ou sortis (négatif : accusés par le broker, perdus).</summary>
    public static void File(long nombre)
    {
        if (nombre != 0) EnFile.Add(nombre);
    }

    /// <summary>Message perdu, par motif : file_pleine (le plus ancien part) ou refus (refusé plusieurs fois par le broker).</summary>
    public static void Perdu(string motif)
    {
        File(-1);
        Perdus.Add(1, new KeyValuePair<string, object?>("motif", motif));
    }
}
