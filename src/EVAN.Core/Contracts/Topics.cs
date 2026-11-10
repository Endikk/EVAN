namespace EVAN.Core.Contracts;

/// <summary>
/// Sujets MQTT. Toujours préfixés par la version du contrat : un changement incompatible crée evan/v2
/// sans casser les passerelles déjà installées.
/// </summary>
public static class Topics
{
    public const string Root = "evan/v1";

    public static string Telemetry(string site, string machine) => $"{Root}/{site}/{machine}/telemetry";
    public static string State(string site, string machine) => $"{Root}/{site}/{machine}/state";
    public static string PlcAlarm(string site, string machine) => $"{Root}/{site}/{machine}/alarm";
    public static string GatewayStatus(string site, string gateway) => $"{Root}/{site}/gateway/{gateway}/status";
    public static string GatewayCommand(string site, string gateway, string command) => $"{Root}/{site}/gateway/{gateway}/cmd/{command}";
    public static string GatewayReply(string site, string gateway, string requestId) => $"{Root}/{site}/gateway/{gateway}/reply/{requestId}";
    public static string SimulatorCommand(string site, string command) => $"{Root}/{site}/sim/cmd/{command}";

    /// <summary>Abonnement du back : télémétrie, états, alarmes automate de tous les sites.</summary>
    public const string IngestFilter = Root + "/+/+/+";
    public const string GatewayFilter = Root + "/+/gateway/+/#";
    /// <summary>Présence des passerelles (« online » retenu, « offline » par dernière volonté) : six niveaux, hors du filtre d'ingestion.</summary>
    public const string GatewayStatusFilter = Root + "/+/gateway/+/status";

    /// <summary>Découpe evan/v1/{site}/{machine}/{kind}.</summary>
    public static bool TryParse(string topic, out string site, out string machine, out string kind)
    {
        site = machine = kind = "";
        var parts = topic.Split('/');
        if (parts.Length != 5 || parts[0] != "evan" || parts[1] != "v1") return false;
        site = parts[2];
        machine = parts[3];
        kind = parts[4];
        return true;
    }

    /// <summary>Découpe evan/v1/{site}/gateway/{passerelle}/status.</summary>
    public static bool TryParseGatewayStatus(string topic, out string site, out string gateway)
    {
        site = gateway = "";
        var parts = topic.Split('/');
        if (parts.Length != 6 || parts[0] != "evan" || parts[1] != "v1" || parts[3] != "gateway" || parts[5] != "status") return false;
        site = parts[2];
        gateway = parts[4];
        return true;
    }
}
