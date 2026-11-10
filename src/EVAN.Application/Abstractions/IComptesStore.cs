using EVAN.Application.Comptes;
using EVAN.Core.Domain.Sites;

namespace EVAN.Application.Abstractions;

/// <summary>
/// Comptes et organisations réelles (celle de la démo vit dans data/demo.json). Implémenté par le même stockage que
/// <see cref="IStore"/> : PostgreSQL, ou mémoire sans base configurée.
/// </summary>
public interface IComptesStore
{
    /// <summary>Compte de cet identifiant (déjà normalisé), ou null.</summary>
    Task<Compte?> CompteAsync(string identifiant, CancellationToken ct = default);

    /// <summary>Comptes d'une organisation, dans l'ordre de création.</summary>
    Task<IReadOnlyList<Compte>> ComptesAsync(string organisationId, CancellationToken ct = default);

    Task<Organisation?> OrganisationAsync(string id, CancellationToken ct = default);

    /// <summary>Crée une organisation et son premier administrateur d'un seul bloc. Faux si l'identifiant est déjà pris (rien n'est créé).</summary>
    Task<bool> CreerOrganisationAsync(Organisation organisation, Compte admin, CancellationToken ct = default);

    /// <summary>
    /// Première installation : comme <see cref="CreerOrganisationAsync"/>, mais seulement tant qu'aucun compte n'existe,
    /// vérifié et écrit d'un seul bloc (deux installations simultanées n'en créent qu'une). Faux si EVAN est déjà installé.
    /// </summary>
    Task<bool> InstallerAsync(Organisation organisation, Compte admin, CancellationToken ct = default);

    /// <summary>Ajoute un compte à une organisation existante. Faux si l'identifiant est déjà pris.</summary>
    Task<bool> AjouterCompteAsync(Compte compte, CancellationToken ct = default);

    /// <summary>Remplace l'empreinte du mot de passe d'un compte. Faux si le compte n'existe plus.</summary>
    Task<bool> ChangerEmpreinteAsync(string compteId, string empreinte, CancellationToken ct = default);
}

/// <summary>Empreinte des mots de passe (algorithme lent et salé, prévu pour cela), fournie par l'hôte (EVAN.Api).</summary>
public interface IMotsDePasse
{
    string Hacher(string motDePasse);

    /// <summary>Vrai si le mot de passe correspond à l'empreinte ; une empreinte illisible ne correspond à rien.</summary>
    bool Verifier(string empreinte, string motDePasse);
}
