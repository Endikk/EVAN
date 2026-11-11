using System.Security.Cryptography;

namespace EVAN.Application.Comptes;

/// <summary>
/// Mot de passe provisoire qu'un administrateur donne à un membre : tiré par le serveur avec un générateur
/// cryptographique, jamais choisi ni vu par le navigateur avant la réponse. Quatre groupes de quatre caractères, sans
/// ceux qui se confondent à la lecture ou à la dictée (0 et O, 1, l et I) : 16 tirages parmi 55, environ 92 bits.
/// </summary>
public static class MotDePasseProvisoire
{
    private const string Alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private const int Groupes = 4;
    private const int ParGroupe = 4;

    /// <summary>Forme attendue, pour les tests : « xxxx-xxxx-xxxx-xxxx » dans l'alphabet ci-dessus.</summary>
    public const string Forme = "^[a-hjkmnp-zA-HJ-NP-Z2-9]{4}(-[a-hjkmnp-zA-HJ-NP-Z2-9]{4}){3}$";

    public static string Generer()
    {
        var tirage = RandomNumberGenerator.GetItems<char>(Alphabet, Groupes * ParGroupe);
        return string.Join('-', Enumerable.Range(0, Groupes).Select(g => new string(tirage, g * ParGroupe, ParGroupe)));
    }
}
