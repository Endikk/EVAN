namespace EVAN.Application.Comptes;

/// <summary>Rôles d'un compte : l'administrateur crée les membres et récupère la configuration des passerelles.</summary>
public static class Roles
{
    public const string Admin = "admin";
    public const string Membre = "membre";

    public static bool Connu(string? role) => role is Admin or Membre;
}

/// <summary>
/// Compte d'un utilisateur, rattaché à une seule organisation. L'identifiant (adresse e-mail, en minuscules) est unique
/// dans toute l'installation : on se connecte avec lui seul. L'empreinte du mot de passe ne quitte jamais le serveur.
/// La génération est portée par chaque session : un mot de passe provisoire, un changement de mot de passe ou une
/// déconnexion l'augmentent, et les sessions ouvertes avant cessent de valoir. Après un mot de passe provisoire
/// (donné le <see cref="ProvisoireLe"/>, ms epoch), <see cref="DoitChanger"/> : le titulaire ne peut que le changer.
/// </summary>
public sealed record Compte(
    string Id, string OrganisationId, string Identifiant, string Nom, string Role, string Empreinte, long CreeLe,
    int Generation = 0, bool DoitChanger = false, long? ProvisoireLe = null);

/// <summary>Actions tracées au journal des comptes (colonne action de journal_comptes).</summary>
public static class ActionCompte
{
    public const string Creation = "creation";
    public const string Retrait = "retrait";
    public const string Reinitialisation = "reinitialisation";
    public const string Changement = "changement";
}

/// <summary>
/// Ligne du journal des comptes : qui a fait quoi à quel compte, d'où et quand (ms epoch). Les identifiants (adresses
/// e-mail) sont gardés en clair à côté des ids : un compte retiré reste lisible dans le journal. Jamais de mot de passe.
/// </summary>
public sealed record EvenementCompte(
    string OrganisationId, string AuteurId, string AuteurIdentifiant, string CibleId, string CibleIdentifiant, string Action, string Adresse, long Le);

/// <summary>
/// Issue d'une action d'un administrateur sur un compte de son organisation. Introuvable vaut aussi pour un compte
/// d'une autre organisation : la réponse ne dit pas s'il existe ailleurs.
/// </summary>
public enum IssueMembre
{
    Fait,
    /// <summary>Aucun compte de cet identifiant dans l'organisation de l'auteur.</summary>
    Introuvable,
    /// <summary>L'auteur vise son propre compte : il change son mot de passe lui-même, et un autre administrateur le retire.</summary>
    Soi,
    /// <summary>L'auteur n'est pas (ou plus) administrateur de cette organisation.</summary>
    Refuse,
    /// <summary>Le compte visé est le dernier administrateur : l'organisation n'en resterait pas sans.</summary>
    DernierAdministrateur,
}

/// <summary>Saisie d'un nouveau compte, telle qu'elle arrive du client (rien n'y est encore vérifié).</summary>
public sealed record NouveauCompte(string? Identifiant, string? Nom, string? MotDePasse, string? Role = null);
