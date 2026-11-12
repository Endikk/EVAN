using System.Threading.RateLimiting;

namespace EVAN.Api.Securite;

/// <summary>
/// Limite les actions d'un administrateur sur les comptes (création, retrait, mot de passe provisoire) : 10 d'affilée,
/// puis une toutes les 10 s, par administrateur. Assez pour ranger une équipe, trop peu pour qu'une session volée
/// vide l'organisation ou fasse calculer des empreintes au serveur en boucle. Chaque demande compte, acceptée ou non.
/// Les compteurs vivent en mémoire, comme ceux de la connexion (<see cref="EssaisConnexion"/>).
/// </summary>
public sealed class ActionsMembres : IDisposable
{
    public const int Rafale = 10;
    public static readonly TimeSpan Attente = TimeSpan.FromSeconds(10);

    private readonly TimeSpan _attente;
    private readonly PartitionedRateLimiter<string> _parAdministrateur;

    /// <param name="attente">
    /// Délai avant qu'une action de plus soit rendue, <see cref="Attente"/> par défaut. Le seau se remplit sur l'horloge
    /// réelle : un test l'allonge pour que la lenteur d'une machine ne lui rende pas d'action en cours de route.
    /// </param>
    public ActionsMembres(TimeSpan? attente = null)
    {
        _attente = attente ?? Attente;
        _parAdministrateur = PartitionedRateLimiter.Create<string, string>(cle => RateLimitPartition.GetTokenBucketLimiter(cle, _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = Rafale,
            TokensPerPeriod = 1,
            ReplenishmentPeriod = _attente,
            QueueLimit = 0,
        }));
    }

    /// <summary>Attente avant la prochaine action de cet administrateur, ou null si celle-ci est permise (et comptée).</summary>
    public TimeSpan? Prendre(string administrateurId)
    {
        using var jeton = _parAdministrateur.AttemptAcquire(administrateurId);
        return jeton.IsAcquired ? null : _attente;
    }

    public void Dispose() => _parAdministrateur.Dispose();
}
