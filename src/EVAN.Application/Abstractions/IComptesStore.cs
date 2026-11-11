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

    /// <summary>
    /// Le titulaire remplace l'empreinte de son mot de passe : la génération augmente (ses autres sessions tombent),
    /// l'obligation de changer est levée. Rend la nouvelle génération, ou null si le compte n'existe plus.
    /// </summary>
    Task<int?> ChangerEmpreinteAsync(string compteId, string empreinte, CancellationToken ct = default);

    /// <summary>Déconnexion : la génération augmente, toutes les sessions du compte tombent. Null si le compte n'existe plus.</summary>
    Task<int?> NouvelleGenerationAsync(string compteId, CancellationToken ct = default);

    /// <summary>Compte de cet identifiant technique dans cette organisation, ou null (inconnu, ou d'une autre organisation).</summary>
    Task<Compte?> CompteDeAsync(string organisationId, string compteId, CancellationToken ct = default);

    Task JournaliserAsync(EvenementCompte evenement, CancellationToken ct = default);

    /// <summary>Journal des comptes d'une organisation, le plus récent d'abord.</summary>
    Task<IReadOnlyList<EvenementCompte>> JournalComptesAsync(string organisationId, int limite, CancellationToken ct = default);

    /// <summary>
    /// Un administrateur retire un compte de son organisation, vérifié et écrit d'un seul bloc : l'auteur doit encore en
    /// être un administrateur (sinon Refuse), le compte visé doit en faire partie (sinon Introuvable), et le dernier
    /// administrateur reste (DernierAdministrateur). Deux retraits croisés simultanés ne vident donc jamais
    /// l'organisation de ses administrateurs.
    /// </summary>
    Task<IssueMembre> RetirerCompteAsync(string organisationId, string auteurId, string compteId, CancellationToken ct = default);

    /// <summary>
    /// Un administrateur remplace l'empreinte d'un compte de son organisation (mot de passe provisoire donné à
    /// <paramref name="provisoireLe"/>) et augmente sa génération : les sessions ouvertes avant cessent de valoir, et
    /// le titulaire devra le changer. Mêmes vérifications que le retrait.
    /// </summary>
    Task<IssueMembre> ReinitialiserEmpreinteAsync(string organisationId, string auteurId, string compteId, string empreinte, DateTimeOffset provisoireLe, CancellationToken ct = default);
}

/// <summary>Empreinte des mots de passe (algorithme lent et salé, prévu pour cela), fournie par l'hôte (EVAN.Api).</summary>
public interface IMotsDePasse
{
    string Hacher(string motDePasse);

    /// <summary>Vrai si le mot de passe correspond à l'empreinte ; une empreinte illisible ne correspond à rien.</summary>
    bool Verifier(string empreinte, string motDePasse);
}
