using System.Globalization;
using System.Net;
using System.Net.Sockets;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using EVAN.Gateway.Sources;

namespace EVAN.Gateway.Security;

/// <summary>Cible acceptée d'un test de liaison : l'hôte demandé, et l'adresse vérifiée à joindre (null : l'hôte tel que déclaré).</summary>
public sealed record CibleTest(string Hote, IPAddress? Adresse);

/// <summary>Verdict de la garde : la cible acceptée, ou l'étape renvoyée au back quand le test est refusé.</summary>
public sealed record DecisionTest(CibleTest? Cible, string Etape);

/// <summary>
/// Garde des tests de liaison. Un test ouvre une connexion depuis le réseau de l'usine vers l'hôte demandé et renvoie ce
/// qu'il y lit : sans garde, quiconque atteint l'API sonderait le réseau atelier et lirait ses automates.
/// Un test n'est accepté que si sa cible est l'hôte d'une connexion déclarée (Gateway:Connections) ou entre dans
/// Gateway:AllowedTestTargets : noms d'hôte exacts, adresses IP, plages CIDR IPv4 et IPv6. Liste vide et cible non
/// déclarée : refus. Un nom qui n'est pas déclaré tel quel est résolu, et chacune de ses adresses doit entrer dans la
/// liste ; la source joint ensuite l'adresse vérifiée, pour qu'un DNS qui change de réponse entre le contrôle et la
/// connexion ne déplace pas la cible. Un refus est journalisé en avertissement et n'ouvre aucune connexion.
/// </summary>
public sealed class GardeTestLiaison
{
    /// <summary>Étape d'un refus : la même pour un nom introuvable et pour une adresse hors liste, sans indice sur le DNS de l'usine.</summary>
    public const string HorsListe = "Adresse hors de la liste autorisée de cette passerelle";
    public const string AdresseIllisible = "Adresse de la machine illisible pour ce protocole";
    public const string ProtocoleInconnu = "Protocole non pris en charge par cette passerelle";
    /// <summary>Résolution d'un nom : au-delà, le test est refusé plutôt que de tenir la passerelle.</summary>
    public static readonly TimeSpan DelaiResolution = TimeSpan.FromSeconds(5);
    /// <summary>Protocoles testables : ceux de <see cref="MachineSourceFactory"/>.</summary>
    public static readonly string[] Protocoles = ["opcua", "modbus", "s7", "jmf"];

    private readonly HashSet<string> _noms = new(StringComparer.OrdinalIgnoreCase);
    private readonly List<Plage> _plages = new();
    private readonly Func<string, CancellationToken, Task<IPAddress[]>> _resoudre;
    private readonly ILogger _log;

    public GardeTestLiaison(GatewayOptions options, ILogger<GardeTestLiaison> log, Func<string, CancellationToken, Task<IPAddress[]>>? resoudre = null)
    {
        _log = log;
        _resoudre = resoudre ?? Dns.GetHostAddressesAsync;
        foreach (var c in options.Connections)
        {
            if (Hote(c.Protocol, c.Parameters) is { } hote) Ajouter(hote);
        }
        foreach (var entree in options.AllowedTestTargets ?? [])
        {
            if (!Ajouter(entree.Trim())) log.LogWarning("Gateway:AllowedTestTargets : entrée « {Entree} » illisible, ignorée", entree);
        }
    }

    private bool Ajouter(string entree)
    {
        if (Plage.TryParse(entree, out var plage))
        {
            _plages.Add(plage);
            return true;
        }
        if (!NomLisible(entree)) return false;
        _noms.Add(entree);
        return true;
    }

    /// <summary>Décide d'un test avant toute connexion. Une cible douteuse est refusée ; seul l'arrêt de la passerelle interrompt.</summary>
    public async Task<DecisionTest> EvaluerAsync(ConnectionTestRequest req, CancellationToken ct)
    {
        if (!Protocoles.Contains(req.Protocole)) return Refuser(req, ProtocoleInconnu, "protocole non pris en charge");
        if (Hote(req.Protocole, req.Parametres) is not { } hote) return Refuser(req, AdresseIllisible, "adresse illisible");

        if (IPAddress.TryParse(hote, out var ip))
        {
            var adresse = Normaliser(ip);
            return Autorisee(adresse) ? Accepter(req, hote, adresse) : Refuser(req, HorsListe, $"{hote} n'est ni déclarée ni dans la liste");
        }
        if (_noms.Contains(hote)) return Accepter(req, hote, null);

        IPAddress[] adresses;
        try
        {
            using var delai = CancellationTokenSource.CreateLinkedTokenSource(ct);
            delai.CancelAfter(DelaiResolution);
            adresses = await _resoudre(hote, delai.Token);
        }
        catch (Exception ex) when (ex is SocketException or ArgumentException || (ex is OperationCanceledException && !ct.IsCancellationRequested))
        {
            return Refuser(req, HorsListe, $"{hote} introuvable ({ex.GetType().Name})");
        }
        if (adresses.Length == 0) return Refuser(req, HorsListe, $"{hote} sans adresse");
        // Toutes les adresses du nom doivent entrer dans la liste : une seule hors liste suffit à refuser.
        var normalisees = adresses.Select(Normaliser).ToArray();
        if (normalisees.FirstOrDefault(a => !Autorisee(a)) is { } dehors) return Refuser(req, HorsListe, $"{hote} résolu en {dehors}, hors de la liste");
        return Accepter(req, hote, normalisees[0]);
    }

    /// <summary>
    /// Hôte que la source joindra, lu comme elle le lit : mêmes paramètres, mêmes valeurs par défaut. Null si le
    /// protocole est inconnu ou si l'adresse ne se lit pas (URL d'un autre schéma, caractères hors d'un nom d'hôte).
    /// </summary>
    internal static string? Hote(string? protocole, Dictionary<string, string>? parametres)
    {
        var p = parametres ?? [];
        var hote = protocole switch
        {
            "modbus" or "s7" => p.Get("hote", Params.HoteParDefaut),
            "opcua" => HoteUrl(p.Get("endpoint", OpcUaSource.EndpointParDefaut), "opc.tcp"),
            "jmf" => HoteUrl(p.Get("url", JmfSource.UrlParDefaut), "http", "https"),
            _ => null,
        };
        return hote is not null && (IPAddress.TryParse(hote, out _) || NomLisible(hote)) ? hote : null;
    }

    private static string? HoteUrl(string texte, params string[] schemas) =>
        Uri.TryCreate(texte, UriKind.Absolute, out var uri) && schemas.Contains(uri.Scheme)
            && uri.HostNameType is UriHostNameType.Dns or UriHostNameType.IPv4 or UriHostNameType.IPv6
            ? uri.IdnHost
            : null;

    /// <summary>Nom d'hôte DNS : lettres ASCII, chiffres, tiret, point, souligné. Rien qui puisse porter un port, un chemin ou un saut de ligne.</summary>
    private static bool NomLisible(string nom) =>
        nom.Length is > 0 and <= 253 && nom.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '.' or '_');

    /// <summary>Une adresse IPv4 écrite en IPv6 (::ffff:a.b.c.d) se compare comme l'IPv4 qu'elle désigne.</summary>
    private static IPAddress Normaliser(IPAddress a) => a.IsIPv4MappedToIPv6 ? a.MapToIPv4() : a;

    private bool Autorisee(IPAddress a) => _plages.Any(p => p.Contient(a));

    private DecisionTest Accepter(ConnectionTestRequest req, string hote, IPAddress? adresse)
    {
        _log.LogInformation("Test de liaison {Requete} accepté : {Protocole} vers {Hote}{Adresse}", req.RequestId, req.Protocole, hote,
            adresse is null ? " (hôte déclaré)" : $" ({adresse})");
        return new DecisionTest(new CibleTest(hote, adresse), "");
    }

    private DecisionTest Refuser(ConnectionTestRequest req, string etape, string detail)
    {
        _log.LogWarning("Test de liaison {Requete} refusé, aucune connexion ouverte : {Detail}", req.RequestId, detail);
        return new DecisionTest(null, etape);
    }

    /// <summary>Plage CIDR ; une adresse seule est une plage de longueur pleine (/32 ou /128).</summary>
    internal sealed record Plage(IPAddress Reseau, int Prefixe)
    {
        public static bool TryParse(string texte, out Plage plage)
        {
            plage = null!;
            var barre = texte.IndexOf('/');
            var adresseTexte = barre < 0 ? texte : texte[..barre];
            if (!IPAddress.TryParse(adresseTexte, out var reseau) || adresseTexte.Contains('%')) return false;
            var max = reseau.AddressFamily == AddressFamily.InterNetwork ? 32 : 128;
            var prefixe = max;
            if (barre >= 0 && !(int.TryParse(texte[(barre + 1)..], NumberStyles.None, CultureInfo.InvariantCulture, out prefixe) && prefixe <= max)) return false;
            // ::ffff:a.b.c.d/n (n ≥ 96) : la plage IPv4 correspondante, puisque les adresses sont comparées normalisées.
            if (reseau.IsIPv4MappedToIPv6)
            {
                if (prefixe < 96) return false;
                (reseau, prefixe) = (reseau.MapToIPv4(), prefixe - 96);
            }
            plage = new Plage(reseau, prefixe);
            return true;
        }

        public bool Contient(IPAddress a)
        {
            if (a.AddressFamily != Reseau.AddressFamily) return false;
            var x = a.GetAddressBytes();
            var r = Reseau.GetAddressBytes();
            var reste = Prefixe;
            for (var i = 0; reste > 0; i++, reste -= 8)
            {
                var masque = reste >= 8 ? 0xFF : (0xFF << (8 - reste)) & 0xFF;
                if ((x[i] & masque) != (r[i] & masque)) return false;
            }
            return true;
        }
    }
}
