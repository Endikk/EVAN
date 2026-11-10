using System.Collections.Immutable;
using EVAN.Application.Usines;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Sites;

namespace EVAN.Application.Live;

/// <summary>
/// Usine connue du temps réel : l'organisation qui la possède, sa description (site, bâtiments, zones, machines) et,
/// pour une usine enregistrée par une organisation réelle, sa configuration complète. Celles de la démo n'en ont pas.
/// </summary>
public sealed record UsineChargee(string OrganisationId, DemoUsine Usine, ConfigurationUsine? Configuration);

/// <summary>
/// Instantané des usines chargées, dans l'ordre de chargement (celles de la démo d'abord) : état temps réel de chacune,
/// et index machine → usine, point → usine qui servent au cloisonnement. Immuable : une usine chargée ou reconfigurée
/// produit un nouvel instantané, remplacé d'un bloc. L'ingestion, la diffusion à 1 Hz et l'API le lisent sans verrou
/// pendant qu'une organisation enregistre son usine.
/// </summary>
internal sealed record Registre(
    ImmutableList<string> Ordre,
    ImmutableDictionary<string, SiteRuntime> Sites,
    ImmutableDictionary<string, UsineChargee> Usines,
    ImmutableDictionary<string, string> SiteDeMachine,
    ImmutableDictionary<string, string> SiteDePoint)
{
    public static readonly Registre Vide = new(
        ImmutableList<string>.Empty,
        ImmutableDictionary<string, SiteRuntime>.Empty,
        ImmutableDictionary<string, UsineChargee>.Empty,
        ImmutableDictionary<string, string>.Empty,
        ImmutableDictionary<string, string>.Empty);

    /// <summary>Le même registre, avec cette usine ajoutée ou remplacée (ses machines et ses points réindexés).</summary>
    public Registre Avec(SiteRuntime site, UsineChargee usine, IReadOnlyList<MachineModel> models)
    {
        var siteId = site.SiteId;
        return new Registre(
            Sites.ContainsKey(siteId) ? Ordre : Ordre.Add(siteId),
            Sites.SetItem(siteId, site),
            Usines.SetItem(siteId, usine),
            Reindexer(SiteDeMachine, siteId, models.Select(m => m.Machine.Id)),
            Reindexer(SiteDePoint, siteId, models.SelectMany(m => m.Points.Select(p => p.Id))));
    }

    private static ImmutableDictionary<string, string> Reindexer(ImmutableDictionary<string, string> index, string siteId, IEnumerable<string> ids) =>
        index.RemoveRange(index.Where(kv => kv.Value == siteId).Select(kv => kv.Key))
             .SetItems(ids.Distinct().Select(id => KeyValuePair.Create(id, siteId)));
}
