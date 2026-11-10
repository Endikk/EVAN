using System.Diagnostics;
using System.Globalization;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using Opc.Ua;
using Opc.Ua.Client;
using Opc.Ua.Configuration;

namespace EVAN.Gateway.Sources;

/// <summary>
/// OPC UA par abonnement (pile OPC Foundation) : l'automate pousse chaque changement de valeur,
/// horodaté à la source. Session chiffrée (SignAndEncrypt) par défaut, certificat applicatif de la passerelle
/// créé au premier démarrage dans pki/own ; les certificats serveur doivent être approuvés (pki/trusted).
/// </summary>
public sealed class OpcUaSource(string pkiDirectory, bool autoAccept, ILogger log) : IMachineSource, IWritableSource
{
    /// <summary>Point d'accès quand le paramètre « endpoint » manque. La garde des tests de liaison part du même.</summary>
    public const string EndpointParDefaut = "opc.tcp://localhost:4840";

    private readonly Dictionary<string, ISession> _sessions = new();
    private readonly ITelemetryContext _telemetry = DefaultTelemetry.Create(b => b.SetMinimumLevel(LogLevel.Warning));
    private readonly SemaphoreSlim _configGate = new(1, 1);
    private volatile ApplicationConfiguration? _config;

    private async Task<ApplicationConfiguration> ConfigAsync(CancellationToken ct)
    {
        if (_config is not null) return _config;
        // Les machines OPC UA démarrent ensemble sur cette source unique : une seule crée la configuration et le certificat.
        await _configGate.WaitAsync(ct);
        try
        {
            return _config ??= await CreateConfigAsync(ct);
        }
        finally
        {
            _configGate.Release();
        }
    }

    private async Task<ApplicationConfiguration> CreateConfigAsync(CancellationToken ct)
    {
        var pki = Path.GetFullPath(pkiDirectory);
        var config = new ApplicationConfiguration
        {
            ApplicationName = "EVAN Gateway",
            ApplicationUri = Utils.Format("urn:{0}:EVAN:Gateway", Utils.GetHostName()),
            ApplicationType = ApplicationType.Client,
            SecurityConfiguration = new SecurityConfiguration
            {
                ApplicationCertificate = new CertificateIdentifier { StoreType = CertificateStoreType.Directory, StorePath = Path.Combine(pki, "own"), SubjectName = "CN=EVAN Gateway, O=EVAN" },
                TrustedIssuerCertificates = new CertificateTrustList { StoreType = CertificateStoreType.Directory, StorePath = Path.Combine(pki, "issuer") },
                TrustedPeerCertificates = new CertificateTrustList { StoreType = CertificateStoreType.Directory, StorePath = Path.Combine(pki, "trusted") },
                RejectedCertificateStore = new CertificateTrustList { StoreType = CertificateStoreType.Directory, StorePath = Path.Combine(pki, "rejected") },
                // Par défaut pas d'acceptation automatique : un certificat serveur inconnu atterrit dans pki/rejected
                // et doit être déplacé dans pki/trusted par un administrateur.
                AutoAcceptUntrustedCertificates = autoAccept,
            },
            TransportQuotas = new TransportQuotas { OperationTimeout = 15_000 },
            ClientConfiguration = new ClientConfiguration { DefaultSessionTimeout = 60_000 },
        };
        await config.ValidateAsync(ApplicationType.Client, ct);
        var app = new ApplicationInstance(config, _telemetry) { ApplicationName = "EVAN Gateway", ApplicationType = ApplicationType.Client };
        await app.CheckApplicationInstanceCertificatesAsync(false, null, ct);
        return config;
    }

    /// <summary>Horodatage d'une valeur : à la source, sinon celui du serveur, sinon l'heure de la passerelle (jamais l'an 1).</summary>
    internal static DateTimeOffset Horodatage(DataValue value, DateTimeOffset maintenant)
    {
        if (value.SourceTimestamp != DateTime.MinValue) return new DateTimeOffset(DateTime.SpecifyKind(value.SourceTimestamp, DateTimeKind.Utc));
        if (value.ServerTimestamp != DateTime.MinValue) return new DateTimeOffset(DateTime.SpecifyKind(value.ServerTimestamp, DateTimeKind.Utc));
        return maintenant;
    }

    /// <summary>Valeur numérique d'une variable : nombres, booléens, texte numérique. Tableaux, structures, dates et non-finis sont ignorés.</summary>
    internal static bool TryToDouble(object? raw, out double value)
    {
        value = raw switch
        {
            bool b => b ? 1 : 0,
            byte or sbyte or short or ushort or int or uint or long or ulong or float or double or decimal => Convert.ToDouble(raw, CultureInfo.InvariantCulture),
            string s when double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) => d,
            _ => double.NaN,
        };
        return double.IsFinite(value);
    }

    /// <summary>
    /// Session sur <paramref name="url"/>. Avec <paramref name="memeHote"/>, la session s'ouvre sur l'hôte et le port de
    /// cette adresse, quel que soit le point d'accès annoncé par le serveur : un serveur ne renvoie pas un test ailleurs.
    /// </summary>
    private async Task<ISession> ConnectAsync(string url, Dictionary<string, string> p, bool memeHote, CancellationToken ct)
    {
        var config = await ConfigAsync(ct);
        var useSecurity = p.Get("securite", "SignAndEncrypt") != "None";
        var description = await CoreClientUtils.SelectEndpointAsync(config, url, useSecurity, 15_000, _telemetry, ct);
        if (memeHote && description is not null) description.EndpointUrl = MemeHote(description.EndpointUrl, new Uri(url));
        var endpoint = new ConfiguredEndpoint(null, description, EndpointConfiguration.Create(config));
        IUserIdentity identity = p.TryGetValue("utilisateur", out var user) && !string.IsNullOrEmpty(user)
            ? new UserIdentity(user, System.Text.Encoding.UTF8.GetBytes(p.Get("motDePasse", "")))
            : new UserIdentity(new AnonymousIdentityToken());
        return await new DefaultSessionFactory(_telemetry).CreateAsync(config, endpoint, false, false, "EVAN", 60_000, identity, null, ct);
    }

    /// <summary>Point d'accès annoncé, ramené sur l'hôte et le port demandés. Un autre transport que celui demandé est refusé.</summary>
    internal static string MemeHote(string? annonce, Uri demande)
    {
        if (!Uri.TryCreate(annonce, UriKind.Absolute, out var uri) || uri.Scheme != demande.Scheme)
            throw new InvalidOperationException($"Le serveur annonce un point d'accès hors de l'adresse demandée : {annonce}");
        return new UriBuilder(uri) { Host = demande.IdnHost, Port = demande.Port }.ToString();
    }

    /// <summary>Adresse d'un test : celle des paramètres, portée sur l'adresse vérifiée par la garde quand elle en a fixé une.</summary>
    internal static string UrlDeTest(Dictionary<string, string> p, System.Net.IPAddress? adresse)
    {
        var url = p.Get("endpoint", EndpointParDefaut);
        return adresse is null ? url : new UriBuilder(url) { Host = adresse.ToString() }.ToString();
    }

    public async Task RunAsync(MachineConnection connection, ISampleSink sink, CancellationToken ct)
    {
        var publishing = connection.Parameters.GetInt("publication", 250);
        while (!ct.IsCancellationRequested)
        {
            ISession? session = null;
            try
            {
                session = await ConnectAsync(connection.Parameters.Get("endpoint", EndpointParDefaut), connection.Parameters, memeHote: false, ct);
                lock (_sessions) _sessions[connection.MachineId] = session;
                var subscription = new Subscription(session.DefaultSubscription)
                {
                    PublishingInterval = publishing,
                    KeepAliveCount = 10,
                    LifetimeCount = 100,
                    PublishingEnabled = true,
                    DisplayName = $"evan-{connection.MachineId}",
                };
                foreach (var point in connection.Points)
                {
                    var item = new MonitoredItem(subscription.DefaultItem)
                    {
                        DisplayName = point.PointId,
                        StartNodeId = NodeId.Parse(point.Address),
                        AttributeId = Attributes.Value,
                        SamplingInterval = publishing,
                        QueueSize = 10,
                        DiscardOldest = true,
                    };
                    var mapping = point;
                    item.Notification += (mi, _) =>
                    {
                        foreach (var value in mi.DequeueValues())
                        {
                            if (!StatusCode.IsGood(value.StatusCode)) continue;
                            if (!TryToDouble(value.Value, out var brute))
                            {
                                log.LogDebug("OPC UA {Machine} : valeur non numérique ignorée sur {Point}", connection.MachineId, mapping.PointId);
                                continue;
                            }
                            var v = brute * mapping.Scale + mapping.Offset;
                            sink.Push(connection.MachineId, new Metric(mapping.PointId, v, Quality: "good", Ts: Horodatage(value, DateTimeOffset.UtcNow)));
                        }
                    };
                    subscription.AddItem(item);
                }
                session.AddSubscription(subscription);
                await subscription.CreateAsync(ct);
                sink.State(connection.MachineId, "marche");
                log.LogInformation("OPC UA {Machine} : abonné à {Count} variables ({Url})", connection.MachineId, connection.Points.Count, connection.Parameters.Get("endpoint", "?"));
                // Surveillance de la session : à la perte de connexion, on recrée tout.
                while (!ct.IsCancellationRequested && session.Connected) await Task.Delay(2000, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                log.LogWarning("OPC UA {Machine} : {Message}. Nouvel essai dans 10 s.", connection.MachineId, ex.Message);
            }
            finally
            {
                // Session perdue ou arrêtée : l'état « marche » posé à la connexion n'est plus republié.
                sink.Lost(connection.MachineId);
                lock (_sessions) _sessions.Remove(connection.MachineId);
                if (session is not null)
                {
                    try { await session.CloseAsync(CancellationToken.None); } catch { /* fermeture au mieux */ }
                    session.Dispose();
                }
            }
            await Task.Delay(10_000, ct).ContinueWith(_ => { });
        }
    }

    public async Task<ConnectionTestReply> TestAsync(ConnectionTestRequest request, System.Net.IPAddress? adresse, CancellationToken ct)
    {
        var reply = new ConnectionTestReply { RequestId = request.RequestId };
        var sw = Stopwatch.StartNew();
        ISession? session = null;
        try
        {
            session = await ConnectAsync(UrlDeTest(request.Parametres, adresse), request.Parametres, memeHote: true, ct);
            reply.Steps.Add(new TestStep($"Session ouverte sur {session.Endpoint.EndpointUrl} ({session.Endpoint.SecurityMode} · {session.Endpoint.SecurityPolicyUri.Split('#').Last()})", true, sw.ElapsedMilliseconds));
            var browser = new Browser(session, new BrowserOptions
            {
                BrowseDirection = BrowseDirection.Forward,
                ReferenceTypeId = ReferenceTypeIds.HierarchicalReferences,
                IncludeSubtypes = true,
                NodeClassMask = (int)(NodeClass.Object | NodeClass.Variable),
            });
            var queue = new Queue<(NodeId Node, int Depth)>();
            queue.Enqueue((ObjectIds.ObjectsFolder, 0));
            while (queue.Count > 0 && reply.Variables.Count < 300)
            {
                var (node, depth) = queue.Dequeue();
                foreach (var r in await browser.BrowseAsync(node, ct))
                {
                    var id = ExpandedNodeId.ToNodeId(r.NodeId, session.NamespaceUris);
                    if (id.NamespaceIndex == 0) continue; // espace standard (Server, types)
                    if (r.NodeClass == NodeClass.Variable) reply.Variables.Add(new BrowsedVariable(id.ToString(), r.DisplayName.Text, "Variable"));
                    else if (depth < 4) queue.Enqueue((id, depth + 1));
                }
            }
            reply.Steps.Add(new TestStep($"Espace d'adressage parcouru : {reply.Variables.Count} variables", true, sw.ElapsedMilliseconds));
            reply.Steps.Add(new TestStep("Lecture seule : aucune écriture effectuée", true));
            return new ConnectionTestReply { RequestId = reply.RequestId, Ok = true, Steps = reply.Steps, Variables = reply.Variables };
        }
        catch (Exception ex)
        {
            reply.Steps.Add(new TestStep($"Échec OPC UA : {ex.Message}", false, sw.ElapsedMilliseconds));
            return reply;
        }
        finally
        {
            if (session is not null)
            {
                try { await session.CloseAsync(CancellationToken.None); } catch { /* fermeture au mieux */ }
                session.Dispose();
            }
        }
    }

    public async Task WriteAsync(string machineId, string address, double value, CancellationToken ct)
    {
        ISession? session;
        lock (_sessions) _sessions.TryGetValue(machineId, out session);
        if (session is null) throw new InvalidOperationException("Aucune session OPC UA ouverte pour cette machine");
        var res = await session.WriteAsync(null, new WriteValueCollection
        {
            new WriteValue { NodeId = NodeId.Parse(address), AttributeId = Attributes.Value, Value = new DataValue(new Variant(value)) },
        }, ct);
        if (StatusCode.IsBad(res.Results[0])) throw new InvalidOperationException($"Écriture refusée par l'automate : {res.Results[0]}");
    }
}
