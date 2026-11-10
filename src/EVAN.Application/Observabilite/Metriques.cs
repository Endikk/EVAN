using System.Diagnostics.Metrics;
using EVAN.Core.Domain.Alarms;

namespace EVAN.Application.Observabilite;

/// <summary>
/// Mesures métier du back, publiées sous le nom « EVAN » par System.Diagnostics.Metrics (bibliothèque standard) :
/// l'API les exporte en OpenTelemetry quand un collecteur est configuré, <c>dotnet-counters monitor --counters EVAN</c>
/// les lit sans rien configurer. Sans écouteur, une mesure ne coûte qu'un test.
/// Les étiquettes ne prennent que des valeurs connues d'avance : un message forgé ne peut pas multiplier les séries.
/// </summary>
public static class Metriques
{
    public const string Nom = "EVAN";

    private static readonly Meter Meter = new(Nom, typeof(Metriques).Assembly.GetName().Version?.ToString());

    private static readonly Counter<long> MessagesMqtt =
        Meter.CreateCounter<long>("evan.mqtt.messages", "{message}", "Messages MQTT reçus par l'ingestion");

    private static readonly Counter<long> MessagesMqttRejetes =
        Meter.CreateCounter<long>("evan.mqtt.messages.rejetes", "{message}", "Messages MQTT écartés par l'ingestion");

    private static readonly Counter<long> AlarmesLevees =
        Meter.CreateCounter<long>("evan.alarmes.levees", "{alarme}", "Alarmes levées par le moteur de règles ou l'automate");

    private static readonly UpDownCounter<long> AlarmesOuvertes =
        Meter.CreateUpDownCounter<long>("evan.alarmes.ouvertes", "{alarme}", "Alarmes non résolues, toutes usines");

    private static readonly UpDownCounter<long> EcrituresEnFile =
        Meter.CreateUpDownCounter<long>("evan.base.file", "{ecriture}", "Écritures en attente de la base, par file : journal ou mesures");

    private static readonly Counter<long> EcrituresPerdues =
        Meter.CreateCounter<long>("evan.base.perdues", "{ecriture}", "Écritures abandonnées : file pleine ou refus répété du serveur");

    /// <summary>File des alarmes, du journal et des états machine (une écriture par objet).</summary>
    public const string FileJournal = "journal";

    /// <summary>File des mesures, écrites par lots en COPY binaire.</summary>
    public const string FileMesures = "mesures";

    /// <summary>Message MQTT reçu par l'ingestion, par type : telemetry, state, alarm, gateway, autre.</summary>
    public static void MessageMqtt(string type) =>
        MessagesMqtt.Add(1, new KeyValuePair<string, object?>("type", type is "telemetry" or "state" or "alarm" or "gateway" ? type : "autre"));

    /// <summary>Message écarté par l'ingestion, par motif : json (illisible), incoherent (usine ou machine autre que le sujet).</summary>
    public static void MessageMqttRejete(string motif) => MessagesMqttRejetes.Add(1, new KeyValuePair<string, object?>("motif", motif));

    /// <summary>Alarme levée (règle ou automate), par gravité et par règle.</summary>
    public static void AlarmeLevee(Alarme alarme) =>
        AlarmesLevees.Add(1, Gravite(alarme), new KeyValuePair<string, object?>("regle", alarme.Regle is "seuil" or "derive" or "repetitif" or "automate" ? alarme.Regle : "autre"));

    /// <summary>
    /// Une alarme de la liste change : <paramref name="avant"/> en sort, <paramref name="apres"/> y entre (null : rien).
    /// Seules les alarmes non résolues comptent, chacune sous sa gravité.
    /// </summary>
    public static void AlarmeRemplacee(Alarme? avant, Alarme? apres)
    {
        if (avant is { Statut: not "resolue" }) AlarmesOuvertes.Add(-1, Gravite(avant));
        if (apres is { Statut: not "resolue" }) AlarmesOuvertes.Add(1, Gravite(apres));
    }

    /// <summary>Écritures entrées dans une file (positif) ou sorties (négatif : écrites, perdues ou abandonnées à l'arrêt).</summary>
    public static void EnFile(string file, long nombre)
    {
        if (nombre != 0) EcrituresEnFile.Add(nombre, new KeyValuePair<string, object?>("file", file));
    }

    /// <summary>Écritures perdues, par motif : file_pleine (les plus anciennes partent) ou refus (rejet répété du serveur).</summary>
    public static void Perdues(string file, string motif, long nombre = 1) =>
        EcrituresPerdues.Add(nombre, new KeyValuePair<string, object?>("file", file), new KeyValuePair<string, object?>("motif", motif));

    private static KeyValuePair<string, object?> Gravite(Alarme a) =>
        new("gravite", a.Gravite is "info" or "attention" or "critique" ? a.Gravite : "autre");
}
