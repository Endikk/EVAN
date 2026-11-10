using EVAN.Core.Domain.Machines;

namespace EVAN.Core.Domain.Sites;

/// <summary>Organisation d'exemple (data/demo.json) : une organisation et ses usines.</summary>
public sealed class DemoOrganisation
{
    public required Organisation Organisation { get; init; }
    public required List<DemoUsine> Usines { get; init; }

    public DemoUsine? Usine(string siteId) => Usines.FirstOrDefault(u => u.Site.Id == siteId);
}

/// <summary>
/// Une usine : son site, ses bâtiments, ses zones et ses machines (identifiants uniques dans l'organisation). Sert aussi
/// aux usines enregistrées par les organisations réelles, dont les organes et points viennent de leur configuration.
/// </summary>
public sealed class DemoUsine
{
    public required Site Site { get; init; }
    public required List<Batiment> Batiments { get; init; }
    public required List<Zone> Zones { get; init; }
    public required List<Machine> Machines { get; init; }
}
