/**
 * Mention visible sur les écrans calculés à partir de l'historique simulé (sept jours générés pour la démonstration) :
 * même branché sur l'API, ces chiffres ne viennent pas encore de mesures réelles et ne doivent pas passer pour tels.
 */
export function SimulatedChip() {
  return (
    <span className="chip" title="Sept jours d’historique générés pour la démonstration, identiques à chaque visite. Ces chiffres ne viennent pas de mesures réelles.">
      Historique simulé
    </span>
  );
}
