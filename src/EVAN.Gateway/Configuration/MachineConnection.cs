namespace EVAN.Gateway.Configuration;

/// <summary>Machine lue par la passerelle : protocole, paramètres de connexion, variables associées.</summary>
public sealed class MachineConnection
{
    public string MachineId { get; set; } = "";
    /// <summary>opcua | modbus | s7 | jmf</summary>
    public string Protocol { get; set; } = "opcua";
    public Dictionary<string, string> Parameters { get; set; } = new();
    public List<PointMapping> Points { get; set; } = new();
}

/// <summary>Variable de l'automate → point de mesure EVAN (association faite à l'étape 5 de l'assistant).</summary>
public sealed class PointMapping
{
    public string PointId { get; set; } = "";
    /// <summary>NodeId OPC UA, registre Modbus (« HR 40101 float32 »), adresse S7 (« DB10.DBD0 »), signal JMF (« Speed »).</summary>
    public string Address { get; set; } = "";
    public double Scale { get; set; } = 1;
    public double Offset { get; set; }
}
