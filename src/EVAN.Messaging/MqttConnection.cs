using System.Buffers;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using MQTTnet;
using MQTTnet.Exceptions;
using MQTTnet.Protocol;
using EVAN.Core.Contracts;

namespace EVAN.Messaging;

/// <summary>
/// Client MQTT partagé par le back, le simulateur et la passerelle : connexion sortante uniquement,
/// reconnexion automatique, abonnements rejoués, publication JSON (QoS 1).
/// </summary>
public sealed class MqttConnection : IAsyncDisposable
{
    private readonly MqttSettings _settings;
    private readonly ILogger _log;
    private readonly IMqttClient _client;
    private readonly List<string> _filters = new();
    private readonly CancellationTokenSource _cts = new();
    private Task? _supervisor;
    // Certificats chargés une fois (et non à chaque tentative de connexion), libérés à la fermeture.
    private X509Certificate2Collection? _trust;
    private X509Certificate2? _clientCert;

    public event Func<string, ReadOnlyMemory<byte>, Task>? MessageReceived;
    public bool IsConnected => _client.IsConnected;

    public MqttConnection(MqttSettings settings, ILogger log)
    {
        _settings = settings;
        _log = log;
        _client = new MqttClientFactory().CreateMqttClient();
        _client.ApplicationMessageReceivedAsync += async e =>
        {
            var handler = MessageReceived;
            if (handler is null) return;
            try
            {
                await handler(e.ApplicationMessage.Topic, e.ApplicationMessage.Payload.ToArray());
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Message MQTT ignoré sur {Topic}", e.ApplicationMessage.Topic);
            }
        };
    }

    /// <summary>Autorité qui a signé le certificat du broker ; relue tant que le fichier est absent.</summary>
    private X509Certificate2Collection? Trust()
    {
        if (_trust is null && _settings.CaFile is not null && File.Exists(_settings.CaFile))
        {
            var trust = new X509Certificate2Collection();
            trust.ImportFromPemFile(_settings.CaFile);
            _trust = trust;
        }
        return _trust;
    }

    /// <summary>Certificat client (mTLS) ; relu tant que le fichier est absent.</summary>
    private X509Certificate2? ClientCertificate()
    {
        if (_clientCert is null && _settings.CertFile is not null && _settings.KeyFile is not null && File.Exists(_settings.CertFile))
        {
            // Rechargement en PKCS#12 : SslStream sous Windows exige une clé persistée.
            using var pem = X509Certificate2.CreateFromPemFile(_settings.CertFile, _settings.KeyFile);
            _clientCert = X509CertificateLoader.LoadPkcs12(pem.Export(X509ContentType.Pkcs12), null);
        }
        return _clientCert;
    }

    private MqttClientOptions BuildOptions()
    {
        var b = new MqttClientOptionsBuilder()
            .WithTcpServer(_settings.Host, _settings.Port)
            .WithClientId(_settings.ClientId)
            .WithKeepAlivePeriod(TimeSpan.FromSeconds(15))
            .WithCleanStart(true);
        if (!string.IsNullOrEmpty(_settings.Username)) b = b.WithCredentials(_settings.Username, _settings.Password);
        if (_settings.WillTopic is not null)
        {
            b = b.WithWillTopic(_settings.WillTopic)
                .WithWillPayload(Encoding.UTF8.GetBytes(_settings.WillPayload ?? "{\"status\":\"offline\"}"))
                .WithWillRetain(true)
                .WithWillQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce);
        }
        if (_settings.Tls)
        {
            var trust = Trust();
            var clientCert = ClientCertificate();
            b = b.WithTlsOptions(o =>
            {
                o.UseTls();
                if (clientCert is not null) o.WithClientCertificates([clientCert]);
                if (trust is not null)
                {
                    // Le broker doit présenter un certificat signé par NOTRE autorité (pas seulement une AC publique).
                    o.WithCertificateValidationHandler(ctx =>
                    {
                        if (ctx.Certificate is null) return false;
                        // Le nom d'hôte doit correspondre au certificat ; seule la racine de confiance est personnalisée.
                        if (ctx.SslPolicyErrors.HasFlag(System.Net.Security.SslPolicyErrors.RemoteCertificateNameMismatch)) return false;
                        using var chain = new X509Chain();
                        chain.ChainPolicy.TrustMode = X509ChainTrustMode.CustomRootTrust;
                        chain.ChainPolicy.CustomTrustStore.AddRange(trust);
                        chain.ChainPolicy.RevocationMode = X509RevocationMode.NoCheck;
                        using var presented = X509CertificateLoader.LoadCertificate(ctx.Certificate.GetRawCertData());
                        return chain.Build(presented);
                    });
                }
            });
        }
        return b.Build();
    }

    public void Subscribe(string filter)
    {
        lock (_filters) _filters.Add(filter);
        if (_client.IsConnected) _ = SubscribeLateAsync(filter);
    }

    /// <summary>Abonnement ajouté une fois connecté. En échec, on coupe : la reconnexion rejoue tous les abonnements.</summary>
    private async Task SubscribeLateAsync(string filter)
    {
        try
        {
            await SubscribeAllAsync([filter], _cts.Token);
        }
        catch (OperationCanceledException) when (_cts.IsCancellationRequested)
        {
            // fermeture
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Abonnement MQTT à {Filter} en échec, reconnexion pour le rejouer", filter);
            await DisconnectQuietlyAsync();
        }
    }

    private async Task SubscribeAllAsync(IEnumerable<string> filters, CancellationToken ct)
    {
        foreach (var f in filters)
        {
            var opts = new MqttClientSubscribeOptionsBuilder().WithTopicFilter(t => t.WithTopic(f).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)).Build();
            var res = await _client.SubscribeAsync(opts, ct);
            // Un refus du broker (droits, filtre invalide…) n'est pas une exception pour MQTTnet : on en fait une.
            foreach (var item in res.Items.Where(i => (int)i.ResultCode >= 0x80))
            {
                _log.LogError("Abonnement MQTT refusé sur {Filter} : {Code}", f, item.ResultCode);
                throw new InvalidOperationException($"Abonnement refusé par le broker sur {f} ({item.ResultCode})");
            }
        }
    }

    private async Task DisconnectQuietlyAsync()
    {
        try
        {
            if (_client.IsConnected) await _client.DisconnectAsync();
        }
        catch (Exception ex)
        {
            _log.LogDebug("Déconnexion MQTT : {Message}", ex.Message);
        }
    }

    /// <summary>Connexion puis surveillance : reconnexion avec attente progressive, sans jamais ouvrir de port entrant.</summary>
    public Task StartAsync(CancellationToken ct)
    {
        var linked = CancellationTokenSource.CreateLinkedTokenSource(ct, _cts.Token).Token;
        _supervisor = Task.Run(async () =>
        {
            var delay = TimeSpan.FromSeconds(1);
            while (!linked.IsCancellationRequested)
            {
                if (!_client.IsConnected)
                {
                    try
                    {
                        await _client.ConnectAsync(BuildOptions(), linked);
                        string[] filters;
                        lock (_filters) filters = _filters.ToArray();
                        await SubscribeAllAsync(filters, linked);
                        _log.LogInformation("MQTT connecté à {Host}:{Port} ({Count} abonnements)", _settings.Host, _settings.Port, filters.Length);
                        delay = TimeSpan.FromSeconds(1);
                    }
                    catch (Exception ex) when (!linked.IsCancellationRequested)
                    {
                        // Connecté mais sans tous ses abonnements : on coupe, sinon le tour suivant croirait la connexion complète.
                        await DisconnectQuietlyAsync();
                        _log.LogWarning("MQTT indisponible ({Message}), nouvel essai dans {Delay} s", ex.Message, delay.TotalSeconds);
                        await Task.Delay(delay, linked).ContinueWith(_ => { });
                        delay = TimeSpan.FromSeconds(Math.Min(30, delay.TotalSeconds * 2));
                        continue;
                    }
                }
                await Task.Delay(2000, linked).ContinueWith(_ => { });
            }
        }, linked);
        return Task.CompletedTask;
    }

    /// <summary>
    /// Publication QoS 1. Faux si le message n'est pas parti (déconnecté, coupure ou délai pendant l'envoi, refus du broker) :
    /// l'appelant le garde et réessaie. Seule l'annulation demandée par l'appelant lève.
    /// </summary>
    public async Task<bool> PublishAsync<T>(string topic, T payload, bool retain = false, CancellationToken ct = default)
    {
        if (!_client.IsConnected) return false;
        var msg = new MqttApplicationMessageBuilder()
            .WithTopic(topic)
            .WithPayload(JsonSerializer.SerializeToUtf8Bytes(payload, Json.Options))
            .WithContentType("application/json")
            .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
            .WithRetainFlag(retain)
            .Build();
        try
        {
            var res = await _client.PublishAsync(msg, ct);
            if (!res.IsSuccess) _log.LogWarning("Publication refusée par le broker sur {Topic} : {Reason}", topic, res.ReasonCode);
            return res.IsSuccess;
        }
        catch (MqttCommunicationException ex)
        {
            _log.LogDebug("Publication interrompue sur {Topic} : {Message}", topic, ex.Message);
            return false;
        }
        catch (Exception ex) when (ex is TimeoutException || (ex is OperationCanceledException && !ct.IsCancellationRequested))
        {
            _log.LogDebug("Publication sans accusé dans le délai sur {Topic}", topic);
            return false;
        }
    }

    public async ValueTask DisposeAsync()
    {
        await _cts.CancelAsync();
        if (_supervisor is not null) await _supervisor.ContinueWith(_ => { });
        await DisconnectQuietlyAsync();
        _client.Dispose();
        _clientCert?.Dispose();
        if (_trust is not null)
        {
            foreach (var c in _trust) c.Dispose();
        }
        _cts.Dispose();
    }
}
