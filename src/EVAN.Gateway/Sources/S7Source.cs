using System.Diagnostics;
using System.Net;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using S7.Net;
using S7.Net.Types;

namespace EVAN.Gateway.Sources;

/// <summary>
/// Siemens S7 (ISO-on-TCP, port 102) pour les S7-300/400 sans serveur OPC UA. Adresses au format
/// S7.Net : « DB10.DBD0 » (REAL), « DB10.DBW4 » (INT), « DB10.DBX8.0 » (BOOL), « MW20 »…
/// </summary>
public sealed class S7Source(ILogger log) : IMachineSource
{
    /// <summary>Automate joint à l'adresse donnée, sinon à l'hôte des paramètres.</summary>
    private static Plc Create(Dictionary<string, string> p, IPAddress? adresse = null)
    {
        var cpu = p.Get("cpu", "S7300") switch
        {
            "S71500" => CpuType.S71500,
            "S71200" => CpuType.S71200,
            "S7400" => CpuType.S7400,
            _ => CpuType.S7300,
        };
        return new Plc(cpu, adresse?.ToString() ?? p.Get("hote", Params.HoteParDefaut), (short)p.GetInt("rack", 0), (short)p.GetInt("slot", 2));
    }

    private static double ToDouble(object? raw, string address) => raw switch
    {
        // Un double mot lu sur une variable REAL arrive en uint : conversion IEEE 754.
        uint u when address.Contains("DBD", StringComparison.OrdinalIgnoreCase) || address.StartsWith("MD", StringComparison.OrdinalIgnoreCase) => u.ConvertToFloat(),
        bool b => b ? 1 : 0,
        null => double.NaN,
        _ => Convert.ToDouble(raw),
    };

    public async Task RunAsync(MachineConnection connection, ISampleSink sink, CancellationToken ct)
    {
        var period = TimeSpan.FromMilliseconds(connection.Parameters.GetInt("scrutation", 500));
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var plc = Create(connection.Parameters);
                await plc.OpenAsync(ct);
                log.LogInformation("S7 {Machine} : connecté ({Count} variables)", connection.MachineId, connection.Points.Count);
                sink.State(connection.MachineId, "marche");
                using var timer = new PeriodicTimer(period);
                while (await timer.WaitForNextTickAsync(ct))
                {
                    var now = DateTimeOffset.UtcNow;
                    foreach (var point in connection.Points)
                    {
                        var v = ToDouble(await plc.ReadAsync(point.Address, ct), point.Address);
                        if (!double.IsNaN(v)) sink.Push(connection.MachineId, new Metric(point.PointId, v * point.Scale + point.Offset, Ts: now));
                    }
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                // Liaison perdue : l'état « marche » posé à la connexion n'est plus republié.
                sink.Lost(connection.MachineId);
                log.LogWarning("S7 {Machine} : {Message}. Nouvel essai dans 10 s.", connection.MachineId, ex.Message);
                await Task.Delay(10_000, ct).ContinueWith(_ => { });
            }
        }
    }

    public async Task<ConnectionTestReply> TestAsync(ConnectionTestRequest request, IPAddress? adresse, CancellationToken ct)
    {
        var reply = new ConnectionTestReply { RequestId = request.RequestId };
        var sw = Stopwatch.StartNew();
        try
        {
            using var plc = Create(request.Parametres, adresse);
            await plc.OpenAsync(ct);
            reply.Steps.Add(new TestStep($"Connexion ISO-on-TCP {request.Parametres.Get("hote", "?")} rack {request.Parametres.Get("rack", "0")} slot {request.Parametres.Get("slot", "2")} ouverte", true, sw.ElapsedMilliseconds));
            reply.Steps.Add(new TestStep("Pas d'inventaire en S7 classique : importez les mnémoniques du projet automate", true));
            return new ConnectionTestReply { RequestId = reply.RequestId, Ok = true, Steps = reply.Steps };
        }
        catch (Exception ex)
        {
            reply.Steps.Add(new TestStep($"Échec S7 : {ex.Message}", false, sw.ElapsedMilliseconds));
            return reply;
        }
    }
}
