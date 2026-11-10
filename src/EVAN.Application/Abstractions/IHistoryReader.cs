using EVAN.Core.Domain.Exploitation;
using EVAN.Core.Domain.Machines;

namespace EVAN.Application.Abstractions;

/// <summary>
/// Historique d'exploitation d'une usine (7 derniers jours) : périodes d'état, alarmes passées, TRS, valeurs des mesures.
/// La démo le simule à l'identique du navigateur (EVAN.Infrastructure) ; en production il se lit dans TimescaleDB.
/// </summary>
public interface IHistoryReader
{
    IHistorique Lire(IReadOnlyList<Machine> machines, long maintenant);
}
