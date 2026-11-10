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
/// </summary>
public sealed record Compte(string Id, string OrganisationId, string Identifiant, string Nom, string Role, string Empreinte, long CreeLe);

/// <summary>Saisie d'un nouveau compte, telle qu'elle arrive du client (rien n'y est encore vérifié).</summary>
public sealed record NouveauCompte(string? Identifiant, string? Nom, string? MotDePasse, string? Role = null);
