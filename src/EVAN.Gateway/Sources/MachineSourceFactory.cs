using EVAN.Gateway.Configuration;

namespace EVAN.Gateway.Sources;

/// <summary>
/// Source de lecture d'un protocole. Ajouter un protocole = une classe <see cref="IMachineSource"/> et une ligne ici.
/// La source OPC UA est unique : elle garde les sessions ouvertes, par lesquelles passent les écritures autorisées.
/// </summary>
public sealed class MachineSourceFactory
{
    private readonly IHttpClientFactory _http;
    private readonly ILoggerFactory _loggers;
    private readonly Lazy<OpcUaSource> _opcUa;

    public MachineSourceFactory(GatewayOptions options, IHttpClientFactory http, ILoggerFactory loggers)
    {
        _http = http;
        _loggers = loggers;
        _opcUa = new(() => new OpcUaSource(options.PkiDirectory, options.AutoAcceptServerCertificates, loggers.CreateLogger<OpcUaSource>()));
    }

    public IMachineSource Create(string protocol) => protocol switch
    {
        "opcua" => _opcUa.Value,
        "modbus" => new ModbusSource(_loggers.CreateLogger<ModbusSource>()),
        "s7" => new S7Source(_loggers.CreateLogger<S7Source>()),
        "jmf" => new JmfSource(_http.CreateClient("jmf"), _loggers.CreateLogger<JmfSource>()),
        _ => throw new NotSupportedException($"Protocole non pris en charge : {protocol}"),
    };
}
