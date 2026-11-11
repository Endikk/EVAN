using System.Collections.Concurrent;
using EVAN.Application.Comptes;

namespace EVAN.Api.Securite;

/// <summary>Ce que la validation d'une session compare au cookie : l'état du compte, sans son empreinte.</summary>
public sealed record EtatCompte(string Id, string OrganisationId, string Role, int Generation, bool DoitChanger, long? ProvisoireLe)
{
    public static EtatCompte De(Compte c) => new(c.Id, c.OrganisationId, c.Role, c.Generation, c.DoitChanger, c.ProvisoireLe);
}

/// <summary>
/// État des comptes gardé 10 s par compte, pour ne pas relire la base à chaque requête d'une session. Toute action qui
/// change un compte (retrait, mot de passe provisoire, changement de mot de passe, déconnexion) l'oublie aussitôt :
/// la révocation reste immédiate. Une lecture commencée avant un oubli ne remet pas l'ancien état en cache (époque).
/// Cache en mémoire de cette instance : avec plusieurs instances de l'API, un oubli ne vaudrait que pour la sienne
/// (docs/ARCHITECTURE.md § 10).
/// </summary>
public sealed class CacheSessions(TimeProvider horloge)
{
    public static readonly TimeSpan Duree = TimeSpan.FromSeconds(10);
    /// <summary>Au-delà, les entrées échues sont balayées à l'écriture (comptes qui ne reviennent plus).</summary>
    private const int Balayage = 1000;

    private readonly ConcurrentDictionary<string, (EtatCompte Etat, DateTimeOffset Jusqua)> _parCompte = new();
    private long _epoque;

    /// <summary>État du compte, en cache s'il a moins de 10 s, sinon lu par <paramref name="charger"/> (null : compte invalide, rien n'est gardé).</summary>
    public async Task<EtatCompte?> ObtenirAsync(string compteId, Func<Task<EtatCompte?>> charger)
    {
        var maintenant = horloge.GetUtcNow();
        if (_parCompte.TryGetValue(compteId, out var entree) && entree.Jusqua > maintenant) return entree.Etat;
        var epoque = Interlocked.Read(ref _epoque);
        var etat = await charger();
        if (etat is null) _parCompte.TryRemove(compteId, out _);
        else if (Interlocked.Read(ref _epoque) == epoque) Garder(compteId, etat, maintenant);
        return etat;
    }

    private void Garder(string compteId, EtatCompte etat, DateTimeOffset maintenant)
    {
        _parCompte[compteId] = (etat, maintenant + Duree);
        if (_parCompte.Count <= Balayage) return;
        foreach (var (cle, valeur) in _parCompte)
            if (valeur.Jusqua <= maintenant) _parCompte.TryRemove(cle, out _);
    }

    /// <summary>Le compte a changé : la prochaine requête de ses sessions relit la base.</summary>
    public void Oublier(string compteId)
    {
        Interlocked.Increment(ref _epoque);
        _parCompte.TryRemove(compteId, out _);
    }
}
