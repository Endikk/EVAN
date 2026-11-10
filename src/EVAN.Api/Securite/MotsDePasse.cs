using EVAN.Application.Abstractions;
using Microsoft.AspNetCore.Identity;

namespace EVAN.Api.Securite;

/// <summary>
/// Empreinte des mots de passe par le <see cref="PasswordHasher{TUser}"/> de Microsoft.Extensions.Identity.Core :
/// PBKDF2 avec HMAC-SHA512, sel aléatoire par compte et 100 000 itérations (format v3). Le format porte ses paramètres :
/// une empreinte ancienne reste vérifiable si les valeurs par défaut augmentent.
/// L'assemblage vient du framework partagé d'ASP.NET Core (Microsoft.AspNetCore.App), à la version du runtime et
/// corrigé avec lui : le référencer en paquet depuis l'infrastructure tirerait les Microsoft.Extensions.* en 10.x,
/// au-dessus des versions 9.0 fixées dans Directory.Packages.props.
/// </summary>
public sealed class MotsDePasse : IMotsDePasse
{
    /// <summary>Le calcul ne dépend pas de l'utilisateur : un titulaire vide suffit au type générique.</summary>
    private sealed class Titulaire;

    private static readonly Titulaire Personne = new();
    private readonly PasswordHasher<Titulaire> _hacheur = new();

    public string Hacher(string motDePasse) => _hacheur.HashPassword(Personne, motDePasse);

    public bool Verifier(string empreinte, string motDePasse)
    {
        try
        {
            return _hacheur.VerifyHashedPassword(Personne, empreinte, motDePasse) is not PasswordVerificationResult.Failed;
        }
        catch (FormatException)
        {
            // Empreinte illisible (base modifiée à la main) : elle ne correspond à aucun mot de passe.
            return false;
        }
    }
}
