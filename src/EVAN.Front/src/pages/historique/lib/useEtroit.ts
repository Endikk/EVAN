/** Écran étroit (téléphone) : les graphiques à libellés longs réduisent la colonne des libellés. */
import { useSyncExternalStore } from 'react';

const REQUETE = '(max-width: 640px)';

function abonner(rappel: () => void) {
  const mq = window.matchMedia(REQUETE);
  mq.addEventListener('change', rappel);
  return () => mq.removeEventListener('change', rappel);
}

export function useEtroit(): boolean {
  return useSyncExternalStore(
    abonner,
    () => window.matchMedia(REQUETE).matches,
    () => false,
  );
}
