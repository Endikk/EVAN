namespace EVAN.Application.Live;

// Modèles de lecture temps réel, formes JSON identiques au front (src/EVAN.Front/src/store/live.ts) ; horodatages en ms epoch.

public sealed record PointLive(double V, long T, string Niveau);

public sealed record MachineLive(string Etat, double Vitesse, double Facteur, long Depuis, double Bonnes, double Gache)
{
    /// <summary>
    /// Liaison perdue (JSON « horsLigne ») : rien reçu depuis le délai de liaison, jamais vue, ou passerelle annoncée hors ligne.
    /// Vrai ou absent ; l'état reste le dernier connu et le facteur vaut 0.
    /// </summary>
    public bool? HorsLigne { get; init; }
}

/// <summary>Panne de démonstration injectée : machine, organe et code d'alarme attendu.</summary>
public sealed record FaultResult(string MachineId, string OrganeId, string? Code);

/// <summary>Instantané temps réel d'une usine (lecture seule).</summary>
public sealed record VueDirecte(
    IReadOnlyDictionary<string, MachineLive> Machines,
    IReadOnlyDictionary<string, PointLive> Valeurs,
    IReadOnlyList<Core.Domain.Alarms.Alarme> Alarmes,
    IReadOnlyList<Core.Domain.Alarms.Evenement> Evenements);
