using System.Text.RegularExpressions;
using EVAN.Core.Domain.Machines;

namespace EVAN.Application.Usines;

/// <summary>
/// appsettings.json de la passerelle d'une usine (EVAN.Gateway), construit depuis l'étape 5 de l'assistant : section
/// Gateway (usine, passerelle, machines à lire et variables associées, hôtes que le test de liaison peut joindre) et
/// Evan:Mqtt (broker et certificat client). Mêmes noms de clés que GatewayOptions et MachineConnection : le fichier se
/// dépose tel quel à côté de la passerelle. Certificat client et droits MQTT restent une étape d'exploitant
/// (infra/mosquitto/ajouter-passerelle.sh) ; rien de secret n'y figure.
/// </summary>
public static partial class ConfigurationPasserelle
{
    /// <summary>Protocoles lus par la passerelle. « mqtt » (capteurs qui publient seuls) et « simulateur » n'y passent pas.</summary>
    public static readonly string[] Protocoles = ["opcua", "modbus", "s7", "jmf"];

    // Formes PascalCase de GatewayOptions, MachineConnection et PointMapping (src/EVAN.Gateway/Configuration).
    public sealed record Fichier(SectionPasserelle Gateway, SectionEvan Evan);

    public sealed record SectionPasserelle(string SiteId, string GatewayId, bool AllowWrites, IReadOnlyList<string> AllowedTestTargets, IReadOnlyList<MachineLue> Connections);

    public sealed record MachineLue(string MachineId, string Protocol, IReadOnlyDictionary<string, string> Parameters, IReadOnlyList<Variable> Points);

    public sealed record Variable(string PointId, string Address, double Scale, double Offset);

    public sealed record SectionEvan(SectionMqtt Mqtt);

    public sealed record SectionMqtt(string? Host, int Port, bool Tls, string CaFile, string CertFile, string KeyFile);

    /// <summary>« HR 40101 (float32) », tel que le front l'affiche, devient « HR 40101 float32 », ce que lit la passerelle.</summary>
    [GeneratedRegex(@"\(([^)]*)\)")]
    private static partial Regex Parentheses();

    /// <param name="broker">Nom d'hôte du broker vu depuis l'usine (Evan:Passerelles:Broker) ; absent, l'exploitant le renseigne.</param>
    public static Fichier Construire(ConfigurationUsine c, string? broker)
    {
        var gw = c.Site.Passerelle ?? throw new InvalidOperationException("Usine sans passerelle attribuée.");
        var numeros = c.Machines.ToDictionary(m => m.Id, m => m.Numero);
        var connexions = c.Connexions
            .Where(x => Protocoles.Contains(x.Protocole) && numeros.ContainsKey(x.MachineId))
            .OrderBy(x => numeros[x.MachineId], StringComparer.Ordinal)
            .ToList();
        var machines = connexions.Select(x => new MachineLue(
            x.MachineId,
            x.Protocole,
            new SortedDictionary<string, string>(x.Parametres, StringComparer.Ordinal),
            x.Associations.OrderBy(a => a.Value, StringComparer.Ordinal).Select(a => new Variable(a.Value, Adresse(x.Protocole, a.Key), 1, 0)).ToList())).ToList();
        var hotes = connexions.Select(Hote).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).Order(StringComparer.Ordinal).ToList();
        return new Fichier(
            new SectionPasserelle(c.Site.Id, gw, AllowWrites: false, hotes, machines),
            new SectionEvan(new SectionMqtt(broker, 8883, true, "certs/ca.crt", $"certs/{gw}.crt", $"certs/{gw}.key")));
    }

    /// <summary>Adresse de la variable telle que la source de la passerelle la lit.</summary>
    public static string Adresse(string protocole, string variable) => protocole switch
    {
        "modbus" => string.Join(' ', Parentheses().Replace(variable, "$1").Split(' ', StringSplitOptions.RemoveEmptyEntries)),
        // Le front nomme les signaux JMF par leur chemin (JMF/Status/Speed) ; la passerelle lit l'attribut (Speed).
        "jmf" => variable[(variable.LastIndexOf('/') + 1)..],
        _ => variable,
    };

    /// <summary>Hôte que la passerelle joint pour cette connexion : celui de l'adresse OPC UA ou JMF, ou l'adresse IP saisie.</summary>
    public static string? Hote(Connexion x)
    {
        string? Valeur(string cle) => x.Parametres.TryGetValue(cle, out var v) && !string.IsNullOrWhiteSpace(v) ? v.Trim() : null;
        var hote = x.Protocole switch
        {
            "opcua" => Uri.TryCreate(Valeur("endpoint"), UriKind.Absolute, out var u) ? u.Host : null,
            "jmf" => Uri.TryCreate(Valeur("url"), UriKind.Absolute, out var u) ? u.Host : null,
            _ => Valeur("hote"),
        };
        return string.IsNullOrEmpty(hote) ? null : hote;
    }
}
