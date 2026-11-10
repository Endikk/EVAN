using EVAN.Core.Domain.Machines;

namespace EVAN.Core.Domain.Catalog;

/// <summary>Organes et points d'une machine, avec les définitions du catalogue (mêmes identifiants que le front).</summary>
public sealed class MachineModel
{
    public required Machine Machine { get; init; }
    public TypeCatalogue? Type { get; init; }
    public List<Organe> Organes { get; } = new();
    public List<PointDeMesure> Points { get; } = new();
    public Dictionary<string, (MesureDef Mesure, OrganeCatalogue Organe)> Defs { get; } = new();
}
