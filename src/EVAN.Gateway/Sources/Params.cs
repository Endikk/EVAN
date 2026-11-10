namespace EVAN.Gateway.Sources;

/// <summary>Lecture des paramètres de connexion (saisis à l'étape 5 de l'assistant) avec valeur par défaut.</summary>
public static class Params
{
    /// <summary>Hôte Modbus et S7 quand le paramètre « hote » manque. La garde des tests de liaison part du même.</summary>
    public const string HoteParDefaut = "127.0.0.1";

    public static string Get(this Dictionary<string, string> p, string key, string fallback) =>
        p.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v : fallback;

    public static int GetInt(this Dictionary<string, string> p, string key, int fallback) =>
        p.TryGetValue(key, out var v) && int.TryParse(v, out var i) ? i : fallback;
}
