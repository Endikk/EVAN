using System.Net;
using EVAN.Core.Contracts;
using EVAN.Gateway.Configuration;

namespace EVAN.Gateway.Sources;

/// <summary>Lecture d'une machine dans un protocole donné. Lecture seule : aucune méthode d'écriture hors <see cref="IWritableSource"/>.</summary>
public interface IMachineSource
{
    /// <summary>Lit en continu (abonnement ou scrutation) jusqu'à l'annulation ; se reconnecte seul.</summary>
    Task RunAsync(MachineConnection connection, ISampleSink sink, CancellationToken ct);
    /// <summary>
    /// Test de liaison demandé depuis l'assistant : connexion, sécurité, inventaire des variables. Appelé seulement
    /// après la garde <see cref="Security.GardeTestLiaison"/> ; <paramref name="adresse"/> est l'adresse qu'elle a
    /// vérifiée, à joindre à la place de l'hôte demandé (null : l'hôte tel que déclaré, joint par son nom).
    /// </summary>
    Task<ConnectionTestReply> TestAsync(ConnectionTestRequest request, IPAddress? adresse, CancellationToken ct);
}
