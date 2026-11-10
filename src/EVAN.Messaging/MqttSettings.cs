namespace EVAN.Messaging;

/// <summary>Paramètres de connexion au broker (section Evan:Mqtt). En production : TLS obligatoire et certificat client par passerelle.</summary>
public sealed class MqttSettings
{
    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 8883;
    public string ClientId { get; set; } = $"evan-{Environment.MachineName}";
    public bool Tls { get; set; } = true;
    /// <summary>Autorité de certification qui a signé le certificat du broker (PEM).</summary>
    public string? CaFile { get; set; }
    /// <summary>Certificat et clé du client (PEM), pour l'authentification mutuelle.</summary>
    public string? CertFile { get; set; }
    public string? KeyFile { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    /// <summary>Message de dernière volonté (passerelle hors ligne), publié par le broker si la connexion tombe.</summary>
    public string? WillTopic { get; set; }
    public string? WillPayload { get; set; }
}
