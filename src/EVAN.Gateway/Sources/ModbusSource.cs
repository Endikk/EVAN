using System.Diagnostics;
using System.Net;
using System.Text.RegularExpressions;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;
using FluentModbus;

namespace EVAN.Gateway.Sources;

/// <summary>
/// Modbus TCP par scrutation (automates anciens). Adresse : « HR 40101 float32 », « IR 30001 int16 »,
/// « HR 40010 uint16 ». Les mots sont lus en big-endian (convention Modbus).
/// </summary>
public sealed partial class ModbusSource(ILogger log) : IMachineSource
{
    [GeneratedRegex(@"^(HR|IR)\s+(\d+)(?:\s+(float32|int16|uint16|int32))?$", RegexOptions.IgnoreCase)]
    private static partial Regex AddressRegex();

    private sealed record Register(bool Holding, int Offset, string Type);

    private static Register Parse(string address)
    {
        var m = AddressRegex().Match(address.Trim());
        if (!m.Success) throw new FormatException($"Adresse Modbus invalide : {address}");
        var holding = m.Groups[1].Value.Equals("HR", StringComparison.OrdinalIgnoreCase);
        var number = int.Parse(m.Groups[2].Value);
        // Numérotation 4xxxx / 3xxxx → décalage à partir de zéro.
        var offset = number >= 40001 ? number - 40001 : number >= 30001 ? number - 30001 : number;
        return new Register(holding, offset, m.Groups[3].Success ? m.Groups[3].Value.ToLowerInvariant() : "float32");
    }

    private static double Read(ModbusTcpClient client, byte unit, Register r)
    {
        return r.Type switch
        {
            "int16" => r.Holding ? client.ReadHoldingRegisters<short>(unit, r.Offset, 1)[0] : client.ReadInputRegisters<short>(unit, r.Offset, 1)[0],
            "uint16" => r.Holding ? client.ReadHoldingRegisters<ushort>(unit, r.Offset, 1)[0] : client.ReadInputRegisters<ushort>(unit, r.Offset, 1)[0],
            "int32" => r.Holding ? client.ReadHoldingRegisters<int>(unit, r.Offset, 1)[0] : client.ReadInputRegisters<int>(unit, r.Offset, 1)[0],
            _ => r.Holding ? client.ReadHoldingRegisters<float>(unit, r.Offset, 1)[0] : client.ReadInputRegisters<float>(unit, r.Offset, 1)[0],
        };
    }

    /// <summary>Connexion à l'adresse donnée, sinon à l'hôte des paramètres (une adresse IP : Modbus ne résout pas de nom).</summary>
    private static ModbusTcpClient Connect(Dictionary<string, string> p, IPAddress? adresse = null)
    {
        var client = new ModbusTcpClient { ConnectTimeout = 5000, ReadTimeout = 3000 };
        client.Connect(new IPEndPoint(adresse ?? IPAddress.Parse(p.Get("hote", Params.HoteParDefaut)), p.GetInt("port", 502)), ModbusEndianness.BigEndian);
        return client;
    }

    public async Task RunAsync(MachineConnection connection, ISampleSink sink, CancellationToken ct)
    {
        var period = TimeSpan.FromMilliseconds(connection.Parameters.GetInt("scrutation", 500));
        var unit = (byte)connection.Parameters.GetInt("unite", 1);
        var registers = connection.Points.Select(p => (Point: p, Reg: Parse(p.Address))).ToList();
        while (!ct.IsCancellationRequested)
        {
            try
            {
                using var client = Connect(connection.Parameters);
                log.LogInformation("Modbus {Machine} : connecté, {Count} registres toutes les {Period} ms", connection.MachineId, registers.Count, period.TotalMilliseconds);
                sink.State(connection.MachineId, "marche");
                using var timer = new PeriodicTimer(period);
                while (await timer.WaitForNextTickAsync(ct))
                {
                    var now = DateTimeOffset.UtcNow;
                    foreach (var (point, reg) in registers)
                    {
                        sink.Push(connection.MachineId, new Metric(point.PointId, Read(client, unit, reg) * point.Scale + point.Offset, Ts: now));
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
                log.LogWarning("Modbus {Machine} : {Message}. Nouvel essai dans 10 s.", connection.MachineId, ex.Message);
                await Task.Delay(10_000, ct).ContinueWith(_ => { });
            }
        }
    }

    public Task<ConnectionTestReply> TestAsync(ConnectionTestRequest request, IPAddress? adresse, CancellationToken ct)
    {
        var reply = new ConnectionTestReply { RequestId = request.RequestId };
        var sw = Stopwatch.StartNew();
        try
        {
            using var client = Connect(request.Parametres, adresse);
            reply.Steps.Add(new TestStep($"Connexion TCP {request.Parametres.Get("hote", "?")}:{request.Parametres.GetInt("port", 502)} ouverte", true, sw.ElapsedMilliseconds));
            var v = client.ReadHoldingRegisters<ushort>((byte)request.Parametres.GetInt("unite", 1), 0, 2).ToArray();
            reply.Steps.Add(new TestStep($"Lecture test HR 40001-40002 : {string.Join(", ", v)}", true, sw.ElapsedMilliseconds));
            reply.Steps.Add(new TestStep("Modbus n'a pas d'inventaire : importez la table d'échange de l'automate", true));
            return Task.FromResult(new ConnectionTestReply { RequestId = reply.RequestId, Ok = true, Steps = reply.Steps });
        }
        catch (Exception ex)
        {
            reply.Steps.Add(new TestStep($"Échec Modbus : {ex.Message}", false, sw.ElapsedMilliseconds));
            return Task.FromResult(reply);
        }
    }
}
