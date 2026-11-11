/** Règles du clavier de l'espace de travail, sans dépendance au navigateur (testées seules). */

/** Ce qu'on lit de la cible d'un événement clavier : de quoi tester sans navigateur. */
export interface CibleClavier {
  tagName: string;
  closest(selecteur: string): unknown;
}

/**
 * Vrai si les flèches peuvent changer d'écran depuis cette cible : le corps de la page (rien n'a le focus), le titre
 * de l'écran (il reçoit le focus après chaque changement d'écran, sans rien proposer au clavier), la scène elle-même ou
 * le canevas 3D. La carte satellite (MapLibre) se déplace aux flèches : elle les garde.
 */
export function flechesChangentEcran(cible: CibleClavier | null): boolean {
  if (!cible) return true;
  const tag = cible.tagName.toUpperCase();
  if (tag === 'BODY' || tag === 'HTML') return true;
  if (tag === 'H1' && cible.closest('.ecran-titre')) return true;
  if (cible.closest('.maplibregl-map')) return false;
  if (tag === 'CANVAS') return !!cible.closest('.stage');
  return tag === 'MAIN' && !!cible.closest('.stage');
}
