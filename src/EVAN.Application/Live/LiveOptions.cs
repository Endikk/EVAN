namespace EVAN.Application.Live;

/// <summary>Réglages du temps réel (section Evan de la configuration).</summary>
public sealed class LiveOptions
{
    /// <summary>
    /// Sans donnée reçue d'une machine depuis ce délai (Evan:LiaisonPerdueSecondes), elle est diffusée « hors ligne ».
    /// Doit rester au-dessus du battement d'état de la passerelle (Gateway:StateHeartbeatMs, 2 s par défaut).
    /// </summary>
    public double LiaisonPerdueSecondes { get; set; } = 5;

    /// <summary>Premier délai avant de réessayer une écriture en base qui a échoué ; il double ensuite jusqu'à 30 s.</summary>
    public TimeSpan NouvelEssai { get; set; } = TimeSpan.FromSeconds(1);

    internal TimeSpan LiaisonPerdue => TimeSpan.FromSeconds(LiaisonPerdueSecondes);
}
