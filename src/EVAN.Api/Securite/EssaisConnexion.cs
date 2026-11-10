using System.Net;
using System.Threading.RateLimiting;

namespace EVAN.Api.Securite;

/// <summary>
/// Limite les essais de connexion et d'installation, pour qu'une attaque par force brute ne tourne pas toute la nuit.
/// Seuls les échecs consomment : par adresse (10, puis un toutes les 30 s) et par compte visé (5, puis un par minute,
/// que le compte existe ou non). Une limite atteinte refuse avant toute vérification, bon mot de passe compris :
/// sinon un essai réussi se distinguerait encore des autres. Les compteurs vivent en mémoire.
/// </summary>
public sealed class EssaisConnexion : IDisposable
{
    public static readonly TimeSpan AttenteAdresse = TimeSpan.FromSeconds(30);
    public static readonly TimeSpan AttenteCompte = TimeSpan.FromMinutes(1);
    public static readonly TimeSpan AttenteInstallation = TimeSpan.FromMinutes(5);

    private readonly PartitionedRateLimiter<string> _parAdresse = Seau(10, AttenteAdresse);
    private readonly PartitionedRateLimiter<string> _parCompte = Seau(5, AttenteCompte);
    private readonly PartitionedRateLimiter<string> _installation = Seau(5, AttenteInstallation);

    private static PartitionedRateLimiter<string> Seau(int essais, TimeSpan attente) =>
        PartitionedRateLimiter.Create<string, string>(cle => RateLimitPartition.GetTokenBucketLimiter(cle, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = essais,
            TokensPerPeriod = 1,
            ReplenishmentPeriod = attente,
            QueueLimit = 0,
        }));

    /// <summary>
    /// Adresse du client : celle de la connexion et, derrière nginx, la dernière de X-Forwarded-For (celle que nginx a
    /// ajoutée). Un en-tête forgé ne donne qu'un compteur d'adresse neuf : celui du compte visé reste commun.
    /// </summary>
    public static string Adresse(HttpContext ctx)
    {
        var connexion = ctx.Connection.RemoteIpAddress is { } ip ? (ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip).ToString() : "inconnue";
        var relais = ctx.Request.Headers["X-Forwarded-For"].ToString().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries);
        return relais.Length > 0 && IPAddress.TryParse(relais[^1], out var client) ? $"{connexion}|{client}" : connexion;
    }

    private static bool Epuise(PartitionedRateLimiter<string> seau, string cle) => seau.GetStatistics(cle)?.CurrentAvailablePermits == 0;

    private static void Consommer(PartitionedRateLimiter<string> seau, string cle)
    {
        using var _ = seau.AttemptAcquire(cle);
    }

    /// <summary>Attente avant le prochain essai de connexion, ou null si l'essai est permis.</summary>
    public TimeSpan? Connexion(string adresse, string identifiant) =>
        Epuise(_parCompte, identifiant) ? AttenteCompte : Epuise(_parAdresse, adresse) ? AttenteAdresse : null;

    public void EchecConnexion(string adresse, string identifiant)
    {
        Consommer(_parAdresse, adresse);
        Consommer(_parCompte, identifiant);
    }

    /// <summary>Attente avant le prochain essai de code d'installation, ou null.</summary>
    public TimeSpan? Installation(string adresse) => Epuise(_installation, adresse) ? AttenteInstallation : null;

    public void EchecInstallation(string adresse) => Consommer(_installation, adresse);

    public void Dispose()
    {
        _parAdresse.Dispose();
        _parCompte.Dispose();
        _installation.Dispose();
    }
}
