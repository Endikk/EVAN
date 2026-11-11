/**
 * Où poser la fiche d'un organe dans la vue (pixels depuis le coin haut gauche du canevas) : à droite de l'organe
 * quand elle y tient, sinon à sa gauche, puis bornée aux bords de la scène. Fonction pure, sans Three.js.
 */

export interface Cadre {
  /** Taille du canevas. */
  largeur: number;
  hauteur: number;
  /** Marge aux bords gauche et droit. */
  marge: number;
  /** Bande réservée en haut (commandes flottantes) et en bas (légende). */
  haut: number;
  bas: number;
  /** Écart entre l'organe et la fiche quand elle bascule à sa gauche. */
  ecart: number;
}

/**
 * `ancre` : point d'accroche habituel (en haut à droite de l'organe) ; `organe` : l'organe lui-même ; `taille` :
 * largeur et hauteur de la fiche. Rend le coin haut gauche de la fiche.
 */
export function placerCarte(ancre: [number, number], organe: [number, number], [l, h]: [number, number], c: Cadre): [number, number] {
  // Fiche pas encore mesurée : la place habituelle, le temps d'une image.
  if (!l || !h) return ancre;
  const droiteMax = c.largeur - c.marge - l;
  let x = ancre[0];
  // À droite, elle déborderait : elle passe à gauche de l'organe, si la place y est.
  if (x > droiteMax && organe[0] - c.ecart - l >= c.marge) x = organe[0] - c.ecart - l;
  x = Math.max(c.marge, Math.min(x, droiteMax));
  const basMax = c.hauteur - c.bas - h;
  // Trop haute pour la vue : collée sous les commandes du haut (elle défile à l'intérieur).
  const y = basMax < c.haut ? c.haut : Math.max(c.haut, Math.min(ancre[1], basMax));
  return [x, y];
}
