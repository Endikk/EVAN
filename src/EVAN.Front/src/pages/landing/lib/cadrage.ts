/**
 * Cadrage de la presse sur l'accueil, en géométrie plane pure (sans Three.js) pour pouvoir le tester.
 *
 * La scène sait projeter les coins de la boîte qui entoure la presse (en pixels de la toile) pour une distance de
 * caméra donnée. On cherche la plus petite distance, donc la presse la plus grande, pour laquelle elle tient entière
 * dans la zone libre sans passer sous le texte ni sous la carte de la machine. La presse vue de trois quarts dessine
 * une diagonale : son enveloppe convexe, plus juste que sa boîte englobante, laisse libre le coin où le texte se pose.
 */

export type Pt = readonly [number, number];

/** Rectangle en pixels de la toile : x vers la droite, y vers le bas. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Distance de caméra et décalage de l'image (à passer à `setViewOffset`) qui placent la presse. */
export interface Cadrage {
  dist: number;
  ox: number;
  oy: number;
}

/** Placements essayés dans la marge restante, du centre de la zone libre vers ses bords. */
const PAS_PLACEMENT = 6;
/** Itérations de la recherche par dichotomie sur la distance : au-delà, l'écart ne se voit plus. */
const ITERATIONS = 22;

export const largeur = (r: Rect) => r.x1 - r.x0;
export const hauteur = (r: Rect) => r.y1 - r.y0;

export function boite(points: readonly Pt[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

const croix = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Enveloppe convexe (chaîne monotone d'Andrew). Les points alignés sont écartés. */
export function enveloppe(points: readonly Pt[]): Pt[] {
  const tri = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (tri.length < 3) return tri;
  const bas: Pt[] = [];
  for (const p of tri) {
    while (bas.length >= 2 && croix(bas[bas.length - 2], bas[bas.length - 1], p) <= 0) bas.pop();
    bas.push(p);
  }
  const haut: Pt[] = [];
  for (let i = tri.length - 1; i >= 0; i--) {
    const p = tri[i];
    while (haut.length >= 2 && croix(haut[haut.length - 2], haut[haut.length - 1], p) <= 0) haut.pop();
    haut.push(p);
  }
  return [...bas.slice(0, -1), ...haut.slice(0, -1)];
}

/** Projection d'un ensemble de points sur un axe : l'intervalle qu'ils couvrent. */
function etendue(points: readonly Pt[], ax: number, ay: number): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const [x, y] of points) {
    const v = x * ax + y * ay;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/**
 * Vrai si le polygone convexe et le rectangle se recouvrent (théorème de l'axe séparateur) : il suffit d'un axe,
 * parmi ceux du rectangle et les normales des côtés du polygone, sur lequel leurs ombres ne se touchent pas.
 */
export function chevauche(poly: readonly Pt[], r: Rect): boolean {
  if (poly.length === 0) return false;
  const coins: Pt[] = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
  const axes: Pt[] = [[1, 0], [0, 1]];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    axes.push([b[1] - a[1], a[0] - b[0]]);
  }
  for (const [ax, ay] of axes) {
    if (ax === 0 && ay === 0) continue;
    const [p0, p1] = etendue(poly, ax, ay);
    const [q0, q1] = etendue(coins, ax, ay);
    if (p1 <= q0 || q1 <= p0) return false;
  }
  return true;
}

const translate = (points: readonly Pt[], dx: number, dy: number): Pt[] => points.map(([x, y]) => [x + dx, y + dy] as const);

/**
 * Où poser la boîte `b` dans `libre` sans que l'enveloppe ne touche un obstacle : décalage (dx, dy) à appliquer aux
 * points, ou null si aucune position ne convient. Le centre de la zone libre d'abord, puis les positions qui s'en
 * éloignent le moins.
 */
function placer(points: readonly Pt[], b: Rect, libre: Rect, eviter: readonly Rect[]): [number, number] | null {
  const jeuX = largeur(libre) - largeur(b);
  const jeuY = hauteur(libre) - hauteur(b);
  if (jeuX < 0 || jeuY < 0) return null;
  const poly = enveloppe(points);
  const candidats: [number, number][] = [];
  for (let i = 0; i <= PAS_PLACEMENT; i++) {
    for (let j = 0; j <= PAS_PLACEMENT; j++) candidats.push([(jeuX * i) / PAS_PLACEMENT, (jeuY * j) / PAS_PLACEMENT]);
  }
  const ecart = ([x, y]: [number, number]) => (x - jeuX / 2) ** 2 + (y - jeuY / 2) ** 2;
  candidats.sort((p, q) => ecart(p) - ecart(q));
  for (const [px, py] of candidats) {
    const dx = libre.x0 + px - b.x0;
    const dy = libre.y0 + py - b.y0;
    const ici = translate(poly, dx, dy);
    if (!eviter.some((r) => chevauche(ici, r))) return [dx, dy];
  }
  return null;
}

/**
 * Cherche la caméra la plus proche qui garde la presse entière dans `libre` et hors des rectangles `eviter`.
 * `projeter(d)` rend les points à garder à l'écran (pixels de la toile, sans décalage) pour la distance `d` ;
 * plus `d` grandit, plus la presse rapetisse, ce qui rend la recherche par dichotomie possible.
 */
export function cadrer(projeter: (d: number) => Pt[], libre: Rect, eviter: readonly Rect[], dMin: number, dMax: number): Cadrage {
  const essai = (d: number) => {
    const pts = projeter(d);
    const b = boite(pts);
    const decalage = placer(pts, b, libre, eviter);
    return decalage ? { d, dx: decalage[0], dy: decalage[1] } : null;
  };
  let trouve = essai(dMax);
  if (!trouve) {
    // Rien ne convient, même de loin : la presse reste entière, centrée dans la zone libre, quitte à frôler le texte.
    const b = boite(projeter(dMax));
    const dx = (libre.x0 + libre.x1) / 2 - (b.x0 + b.x1) / 2;
    const dy = (libre.y0 + libre.y1) / 2 - (b.y0 + b.y1) / 2;
    return { dist: dMax, ox: -dx, oy: -dy };
  }
  let lo = dMin;
  let hi = dMax;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const r = essai(mid);
    if (r) {
      trouve = r;
      hi = mid;
    } else lo = mid;
  }
  // Décaler les points de (dx, dy) à l'écran revient à décaler l'image de (-dx, -dy).
  return { dist: trouve.d, ox: -trouve.dx, oy: -trouve.dy };
}

/**
 * Bande où poser la presse : la zone libre, arrêtée au-dessus des blocs posés en bas de la scène (le texte, l'index des
 * vues), et sous une barre qui la traverse en haut (la carte de la machine, sur téléphone). La presse se centre dans
 * cette bande, au milieu de l'écran, quoi qu'on regarde. Un bloc étroit en haut (la carte, sur grand écran) ne la
 * rogne pas : la presse l'évite seulement.
 */
export function bande(libre: Rect, eviter: readonly Rect[]): Rect {
  const milieu = (libre.y0 + libre.y1) / 2;
  const y1 = eviter.reduce((y, r) => ((r.y0 + r.y1) / 2 > milieu ? Math.min(y, r.y0) : y), libre.y1);
  const y0 = eviter.reduce((y, r) => ((r.y0 + r.y1) / 2 <= milieu && largeur(r) >= largeur(libre) / 2 ? Math.max(y, r.y1) : y), libre.y0);
  // Jamais moins de la moitié de la hauteur : sur un écran très bas, la presse frôle le texte plutôt que de disparaître.
  const h = Math.max(y1 - y0, hauteur(libre) * 0.5);
  return { ...libre, y0: Math.min(y0, libre.y1 - h), y1: Math.min(libre.y1, Math.min(y0, libre.y1 - h) + h) };
}

/**
 * Comme `cadrer`, mais la presse ne bouge jamais du centre de `zone` : seule la distance est cherchée, la plus petite
 * pour laquelle la presse tient entière dans la zone sans toucher un obstacle (la carte de la machine).
 */
export function centrer(projeter: (d: number) => Pt[], zone: Rect, eviter: readonly Rect[], dMin: number, dMax: number): Cadrage {
  const cx = (zone.x0 + zone.x1) / 2;
  const cy = (zone.y0 + zone.y1) / 2;
  const essai = (d: number) => {
    const pts = projeter(d);
    const b = boite(pts);
    if (largeur(b) > largeur(zone) || hauteur(b) > hauteur(zone)) return null;
    const dx = cx - (b.x0 + b.x1) / 2;
    const dy = cy - (b.y0 + b.y1) / 2;
    const poly = translate(enveloppe(pts), dx, dy);
    return eviter.some((r) => chevauche(poly, r)) ? null : { d, dx, dy };
  };
  let trouve = essai(dMax);
  if (!trouve) {
    const b = boite(projeter(dMax));
    return { dist: dMax, ox: (b.x0 + b.x1) / 2 - cx, oy: (b.y0 + b.y1) / 2 - cy };
  }
  let lo = dMin;
  let hi = dMax;
  for (let i = 0; i < ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const r = essai(mid);
    if (r) {
      trouve = r;
      hi = mid;
    } else lo = mid;
  }
  return { dist: trouve.d, ox: -trouve.dx, oy: -trouve.dy };
}
