using EVAN.Application.Abstractions;
using EVAN.Core.Domain.Catalog;
using EVAN.Core.Domain.Exploitation;
using EVAN.Core.Domain.Machines;

namespace EVAN.Infrastructure.Simulation;

/// <summary>
/// Port d'historique de la démo : l'historique simulé, recalculé une fois par heure et par usine (quelques usines en
/// mémoire). En production, un adaptateur TimescaleDB prend sa place.
/// </summary>
public sealed class SimulatedHistoryReader(ReferenceData data) : IHistoryReader
{
    private const int Capacite = 8;
    private readonly object _gate = new();
    private readonly LinkedList<(string Cle, Lazy<HistoriqueSimule> Historique)> _cache = new();

    public IHistorique Lire(IReadOnlyList<Machine> machines, long maintenant)
    {
        var heure = maintenant / Duree.Heure * Duree.Heure;
        var cle = $"{heure}|{string.Join(',', machines.Select(m => $"{m.Id}:{m.Type}"))}";
        Lazy<HistoriqueSimule> historique;
        lock (_gate) historique = Trouver(cle) ?? Ajouter(cle, machines, maintenant);
        try
        {
            // Hors verrou : les requêtes concurrentes de la même heure attendent ce seul calcul au lieu de le refaire.
            return historique.Value;
        }
        catch
        {
            // Un calcul en échec n'est pas gardé : la requête suivante le relance.
            lock (_gate)
            {
                for (var n = _cache.First; n is not null; n = n.Next)
                {
                    if (!ReferenceEquals(n.Value.Historique, historique)) continue;
                    _cache.Remove(n);
                    break;
                }
            }
            throw;
        }
    }

    private Lazy<HistoriqueSimule>? Trouver(string cle)
    {
        for (var n = _cache.First; n is not null; n = n.Next)
        {
            if (n.Value.Cle != cle) continue;
            _cache.Remove(n);
            _cache.AddFirst(n);
            return n.Value.Historique;
        }
        return null;
    }

    private Lazy<HistoriqueSimule> Ajouter(string cle, IReadOnlyList<Machine> machines, long maintenant)
    {
        var historique = new Lazy<HistoriqueSimule>(() => new HistoriqueSimule(machines.Select(data.Model), maintenant, Fuseau.Paris), LazyThreadSafetyMode.ExecutionAndPublication);
        _cache.AddFirst((cle, historique));
        while (_cache.Count > Capacite) _cache.RemoveLast();
        return historique;
    }
}
