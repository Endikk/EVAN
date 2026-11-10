using EVAN.Application.Live;

namespace EVAN.Api.Endpoints;

/// <summary>
/// Cohérence d'usine des requêtes : une machine nommée dans une requête adressée à une usine ne peut pas être celle d'une
/// autre usine de l'organisation (les identifiants de machine sont uniques dans toute l'organisation).
/// </summary>
internal static class Usines
{
    /// <summary>
    /// Vrai si la machine est déclarée par une autre usine que <paramref name="siteId"/>. Une machine qu'aucune usine ne
    /// déclare (placée à l'écran, pas encore enregistrée côté back) n'est pas jugée ici.
    /// </summary>
    public static bool MachineDUneAutreUsine(this LiveService live, string siteId, string? machineId) =>
        !string.IsNullOrEmpty(machineId)
        && live.SiteIds.Any(id => id != siteId && live.Site(id)?.Machines.Any(m => m.Id == machineId) == true);
}
