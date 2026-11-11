/**
 * Étiquettes des pièces posées sur la presse (vue « Les 9 pièces ») : se lisent-elles toutes à l'écran ? Géométrie
 * plane pure, sans Three.js, pour pouvoir la tester. Chaque étiquette est centrée sur son point (drei <Html center>),
 * en pixels de la toile.
 *
 * Sur un écran étroit, la presse rapetisse et ses neuf noms se chevauchent : les étiquettes ne gardent alors que le
 * numéro de la pièce, et une légende sous la presse donne les noms.
 */
export interface Etiquette {
  /** Centre, en pixels de la toile. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Air minimal entre deux étiquettes, en pixels. Le balancement de la caméra les déplace un peu de côté (quelques degrés
 * d'azimut) : l'air est plus large en travers qu'en hauteur, où deux rangées voisines bougent ensemble.
 */
export const AIR_ETIQUETTES = { x: 4, y: 2 };

interface Air {
  x: number;
  y: number;
}

/** Vrai si les deux étiquettes se touchent, air compris. */
function touchent(a: Etiquette, b: Etiquette, air: Air): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + 2 * air.x && Math.abs(a.y - b.y) * 2 < a.h + b.h + 2 * air.y;
}

/**
 * Vrai si chaque étiquette tient entière dans la largeur de la toile et n'en touche aucune autre. Sinon, les noms ne
 * se lisent pas et l'accueil passe aux numéros seuls.
 */
export function etiquettesLisibles(etiquettes: readonly Etiquette[], largeurToile: number, air: Air = AIR_ETIQUETTES): boolean {
  for (let i = 0; i < etiquettes.length; i++) {
    const a = etiquettes[i];
    if (a.x - a.w / 2 < 0 || a.x + a.w / 2 > largeurToile) return false;
    for (let j = i + 1; j < etiquettes.length; j++) if (touchent(a, etiquettes[j], air)) return false;
  }
  return true;
}
