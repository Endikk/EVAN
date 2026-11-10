using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;

namespace EVAN.Gateway.Sources;

/// <summary>
/// JDF/JMF (CIP4) pour les presses d'imprimerie qui le proposent (Gallus, Heidelberg…) :
/// requête Status périodique, état de la presse, vitesse et compteurs de production.
/// Les signaux JMF ne donnent pas les mesures par organe : pour cela il faut l'accès OPC UA à l'automate.
/// </summary>
public sealed class JmfSource(HttpClient http, ILogger log) : IMachineSource
{
    /// <summary>Adresse JMF quand le paramètre « url » manque. La garde des tests de liaison part de la même.</summary>
    public const string UrlParDefaut = "http://localhost:8080/jmf";
    /// <summary>Réponse d'un test : une réponse Status tient en quelques kilo-octets, rien ne justifie d'en lire plus.</summary>
    private const int ReponseTestMax = 1024 * 1024;

    private static readonly XNamespace Ns = "http://www.CIP4.org/JDFSchema_1_1";

    private static readonly XmlReaderSettings LectureXml = new() { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };

    private static string StatusQuery() =>
        $"""
        <?xml version="1.0" encoding="UTF-8"?>
        <JMF xmlns="http://www.CIP4.org/JDFSchema_1_1" SenderID="EVAN-Gateway" TimeStamp="{DateTimeOffset.UtcNow:O}" Version="1.4">
          <Query ID="Q{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}" Type="Status">
            <StatusQuParams DeviceDetails="Details" JobDetails="Brief"/>
          </Query>
        </JMF>
        """;

    /// <summary>États JDF → états EVAN.</summary>
    private static string MapStatus(string? s) => s switch
    {
        "Running" => "marche",
        "Setup" or "Cleanup" => "calage",
        _ => "arret",
    };

    private static async Task<XElement?> QueryAsync(HttpClient client, string url, CancellationToken ct)
    {
        using var content = new StringContent(StatusQuery(), Encoding.UTF8, "application/vnd.cip4-jmf+xml");
        using var res = await client.PostAsync(url, content, ct);
        res.EnsureSuccessStatusCode();
        // Réponse venue du réseau atelier : pas de DTD, donc ni entité externe ni expansion d'entités en chaîne.
        using var lecteur = XmlReader.Create(new StringReader(await res.Content.ReadAsStringAsync(ct)), LectureXml);
        var doc = XDocument.Load(lecteur);
        return doc.Descendants(Ns + "DeviceInfo").FirstOrDefault() ?? doc.Descendants("DeviceInfo").FirstOrDefault();
    }

    private static double? Attr(XElement e, string name) =>
        double.TryParse(e.Attribute(name)?.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;

    public async Task RunAsync(MachineConnection connection, ISampleSink sink, CancellationToken ct)
    {
        var url = connection.Parameters.Get("url", UrlParDefaut);
        var period = TimeSpan.FromMilliseconds(connection.Parameters.GetInt("intervalle", 5000));
        using var timer = new PeriodicTimer(period);
        string? lastStatus = null;
        while (await timer.WaitForNextTickAsync(ct).AsTask().ContinueWith(t => !t.IsCanceled && t.Result))
        {
            try
            {
                var info = await QueryAsync(http, url, ct);
                if (info is null) continue;
                var status = info.Attribute("DeviceStatus")?.Value;
                var speed = Attr(info, "Speed");
                sink.State(connection.MachineId, MapStatus(status), speed);
                var now = DateTimeOffset.UtcNow;
                foreach (var point in connection.Points)
                {
                    var v = point.Address switch
                    {
                        "Speed" => speed,
                        "ProductionCounter" => Attr(info, "ProductionCounter") ?? Attr(info, "TotalProductionCounter"),
                        "WasteCounter" => Attr(info, "WasteCounter"),
                        "DeviceStatus" => status == "Down" ? 1 : 0,
                        _ => Attr(info, point.Address),
                    };
                    if (v is { } value) sink.Push(connection.MachineId, new Metric(point.PointId, value * point.Scale + point.Offset, Ts: now));
                }
                // Presse « Down » : alarme automate tant que l'état persiste.
                if (status != lastStatus && (status == "Down" || lastStatus == "Down"))
                {
                    sink.Alarm(new PlcAlarmMessage
                    {
                        SiteId = "", MachineId = connection.MachineId, Ts = now, Code = "JMF-DOWN", Active = status == "Down",
                        Message = info.Attribute("StatusDetails")?.Value ?? "Presse à l'arrêt sur défaut (JMF)",
                    });
                }
                lastStatus = status;
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                // Presse injoignable : son dernier état n'est plus republié jusqu'à la prochaine réponse.
                sink.Lost(connection.MachineId);
                log.LogWarning("JMF {Machine} : {Message}", connection.MachineId, ex.Message);
            }
        }
    }

    /// <summary>
    /// Client d'un test : sans relais ni redirection, qui mènerait la requête hors de la cible vérifiée, réponse bornée.
    /// Avec une adresse vérifiée, la connexion TCP part vers elle ; l'URL garde le nom demandé (en-tête Host, TLS).
    /// </summary>
    internal static HttpClient ClientDeTest(IPAddress? adresse)
    {
        var handler = new SocketsHttpHandler
        {
            AllowAutoRedirect = false,
            UseProxy = false,
            ConnectTimeout = TimeSpan.FromSeconds(5),
            ConnectCallback = adresse is null ? null : (ctx, ct) => ConnecterAsync(adresse, ctx.DnsEndPoint.Port, ct),
        };
        return new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(10), MaxResponseContentBufferSize = ReponseTestMax };
    }

    private static async ValueTask<Stream> ConnecterAsync(IPAddress adresse, int port, CancellationToken ct)
    {
        var socket = new Socket(SocketType.Stream, ProtocolType.Tcp) { NoDelay = true };
        try
        {
            await socket.ConnectAsync(new IPEndPoint(adresse, port), ct);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }

    public async Task<ConnectionTestReply> TestAsync(ConnectionTestRequest request, IPAddress? adresse, CancellationToken ct)
    {
        var reply = new ConnectionTestReply { RequestId = request.RequestId };
        var sw = Stopwatch.StartNew();
        try
        {
            var url = request.Parametres.Get("url", UrlParDefaut);
            using var client = ClientDeTest(adresse);
            var info = await QueryAsync(client, url, ct);
            reply.Steps.Add(new TestStep($"POST {url} Status : {(info is null ? "pas de DeviceInfo" : $"presse {info.Attribute("DeviceStatus")?.Value}")}", info is not null, sw.ElapsedMilliseconds));
            foreach (var name in new[] { "DeviceStatus", "Speed", "ProductionCounter", "WasteCounter" })
                reply.Variables.Add(new BrowsedVariable($"JMF/Status/{name}", name, "Double"));
            return new ConnectionTestReply { RequestId = reply.RequestId, Ok = info is not null, Steps = reply.Steps, Variables = reply.Variables };
        }
        catch (Exception ex)
        {
            reply.Steps.Add(new TestStep($"Échec JMF : {ex.Message}", false, sw.ElapsedMilliseconds));
            return reply;
        }
    }
}
