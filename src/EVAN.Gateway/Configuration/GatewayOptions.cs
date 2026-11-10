namespace EVAN.Gateway.Configuration;

/// <summary>Configuration de la passerelle installée dans l'usine (appsettings.json, section « Gateway »).</summary>
public sealed class GatewayOptions
{
    public string SiteId { get; set; } = "site-tours";
    public string GatewayId { get; set; } = "tours-01";
    /// <summary>Intervalle d'envoi groupé vers le back.</summary>
    public int PublishIntervalMs { get; set; } = 1000;
    /// <summary>
    /// Battement : l'état d'une machine part à chaque changement, et inchangé à cet intervalle pour prouver que la liaison
    /// vit (une variable OPC UA immobile ne publie rien). Doit rester sous le délai de liaison perdue du back (5 s).
    /// </summary>
    public int StateHeartbeatMs { get; set; } = 2000;
    /// <summary>Messages gardés en mémoire si le broker est injoignable (les plus anciens sont abandonnés au-delà).</summary>
    public int BufferCapacity { get; set; } = 50_000;
    /// <summary>
    /// Écriture vers les automates. Faux par défaut : la passerelle est en lecture seule.
    /// Même à vrai, chaque écriture exige un opérateur et une raison, et elle est journalisée.
    /// </summary>
    public bool AllowWrites { get; set; }
    public string AuditFile { get; set; } = "audit/ecritures.jsonl";
    public string PkiDirectory { get; set; } = "pki";
    /// <summary>
    /// Accepte d'office le certificat des serveurs OPC UA. Faux par défaut : un certificat inconnu doit être
    /// approuvé par un administrateur (pki/trusted). À n'activer que pour un banc de test.
    /// </summary>
    public bool AutoAcceptServerCertificates { get; set; }
    /// <summary>
    /// Cibles permises aux tests de liaison, en plus des hôtes des connexions déclarées : noms d'hôte exacts, adresses IP,
    /// plages CIDR IPv4 et IPv6 (« automate-12.atelier », « 10.20.1.40 », « 10.20.0.0/16 », « fd00:20::/64 »).
    /// Vide par défaut : seuls les hôtes de <see cref="Connections"/> peuvent être testés, rien d'autre du réseau atelier.
    /// </summary>
    public string[] AllowedTestTargets { get; set; } = [];
    public List<MachineConnection> Connections { get; set; } = new();
}
