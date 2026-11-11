using EVAN.Core.Domain.Exploitation;

namespace EVAN.Application.Abstractions;

/// <summary>
/// Persistance du carnet de maintenance d'une usine : interventions consignées (saisies) et interventions planifiées.
/// Tout est rangé par usine : une saisie ou une intervention planifiée ne se lit, ne se corrige et ne se supprime que
/// dans l'usine où elle a été écrite. Sans base, rien n'est écrit (le carnet vit alors dans la mémoire de CarnetService).
/// </summary>
public interface ICarnetStore
{
    /// <summary>Saisies d'une usine, de la dernière enregistrée à la plus ancienne, <paramref name="max"/> au plus.</summary>
    Task<IReadOnlyList<Saisie>> SaisiesAsync(string siteId, int max, CancellationToken ct = default);

    /// <summary>Ajoute une saisie (ou la remplace, même identifiant) en tête ; au-delà de <paramref name="garder"/>, les plus anciennes partent.</summary>
    Task AjouterSaisieAsync(string siteId, Saisie saisie, int garder, CancellationToken ct = default);

    /// <summary>Remplace une saisie existante de cette usine, à sa place. Faux si elle n'y est pas.</summary>
    Task<bool> CorrigerSaisieAsync(string siteId, Saisie saisie, CancellationToken ct = default);

    /// <summary>Retire une saisie de cette usine. Faux si elle n'y est pas.</summary>
    Task<bool> SupprimerSaisieAsync(string siteId, string id, CancellationToken ct = default);

    /// <summary>Interventions planifiées d'une usine, <paramref name="max"/> au plus.</summary>
    Task<IReadOnlyList<Prevue>> PrevuesAsync(string siteId, int max, CancellationToken ct = default);

    /// <summary>Planifie une intervention, ou la déplace (même identifiant) ; au-delà de <paramref name="garder"/>, les plus anciennes partent.</summary>
    Task PlanifierAsync(string siteId, Prevue prevue, int garder, CancellationToken ct = default);

    /// <summary>Annule une intervention planifiée de cette usine. Faux si elle n'y est pas.</summary>
    Task<bool> AnnulerPrevueAsync(string siteId, string id, CancellationToken ct = default);
}
