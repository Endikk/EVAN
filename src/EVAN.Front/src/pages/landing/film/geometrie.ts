/**
 * Où se trouvent les objets du film à une image donnée, en pixels du repère de la scène (.lp-scene). Les places au
 * repos sont mesurées une fois sur la page (point du titre, puce, étiquette) ; les ancres viennent de la 3D (le moyeu du
 * dernier rouleau, le point posé sur la presse, l'étiquette de la dorure). Le résultat est un jeu de variables CSS :
 * la page les lit, aucun style du film n'est calculé ailleurs.
 */
import type { Canaux } from './timeline';

export interface Pt {
  x: number;
  y: number;
}
export interface Boite extends Pt {
  w: number;
  h: number;
}

export interface Mesures {
  /** La scène, dans le repère de la zone sous l'en-tête (.lp-hero) : les objets du film y sont posés. */
  scene: Boite;
  /** Point du titre au repos : centre et rayon. */
  point: Pt & { r: number };
  /** Puce « Une panne expliquée » au repos. */
  puce: Boite | null;
  /** Carte de la machine au repos : la lumière passe derrière elle, jamais dessus. */
  carte: Boite | null;
  /** Taille de l'étiquette « CF-02 » repliée, posée sur la pièce, et hauteur de sa consigne dépliée. */
  pastille: { w: number; h: number; consigne: number };
}

export interface Ancres {
  /** Moyeu du dernier rouleau, projeté dans la vue de repos : là où le point se pose. */
  rouleau: Pt | null;
  /** Le point posé sur la presse, projeté avec la caméra de l'image (moyeu, bande, dorure). */
  point: Pt | null;
  /** Étiquette au-dessus de la dorure, projetée avec la caméra de l'image. */
  pin: Pt | null;
}

const borne = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/** Posée sur la presse, la lumière est bien plus grosse que le point du titre : c'est l'objet que l'œil suit. */
const POINT_PRESSE = 2.4;
const POINT_PRESSE_MIN = 10;

/** Point d'une courbe de Bézier quadratique ; `k` hors de [0, 1] prolonge la courbe (anticipation). */
function arc(a: Pt, b: Pt, levee: number, k: number): Pt {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  // Normale tournée vers le haut de l'écran : l'objet monte en arc.
  let nx = -dy / l;
  let ny = dx / l;
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const c = { x: mx + nx * l * levee, y: my + ny * l * levee };
  const u = 1 - k;
  return { x: u * u * a.x + 2 * u * k * c.x + k * k * b.x, y: u * u * a.y + 2 * u * k * c.y + k * k * b.y };
}

/** Où est la lumière du point d'état, et de quelle taille : posée sur le dernier rouleau, puis en vol vers le titre. */
export function positionPoint(c: Canaux, m: Mesures, a: Ancres): { p: Pt; r: number } {
  const rt = m.point.r;
  const rp = Math.max(rt * POINT_PRESSE, POINT_PRESSE_MIN);
  const surPresse = a.point ?? a.rouleau ?? m.point;
  if (c.vol > 0) return { p: arc(surPresse, m.point, 0.3, c.vol), r: mix(rp, rt, c.vol) };
  return { p: surPresse, r: rp };
}

/** Opacité de la lumière près d'un rectangle qu'elle doit passer derrière : nulle dedans, pleine à une largeur d'elle. */
function derriere(p: Pt, r: number, b: Boite): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return borne((Math.hypot(dx, dy) - r) / r, 0, 1);
}

/** Variables CSS du film pour l'image décrite par `c`. */
export function variables(c: Canaux, m: Mesures, a: Ancres): Record<string, string> {
  const v: Record<string, string> = { '--f-ox': px(m.scene.x), '--f-oy': px(m.scene.y) };
  v['--f-surtitre'] = c.surtitre.toFixed(4);
  v['--f-l1'] = c.ligne1.toFixed(4);
  v['--f-l2'] = c.ligne2.toFixed(4);
  // Le point final n'apparaît qu'à l'arrivée de la lumière : elle vient le poser.
  v['--f-point-vert'] = c.pointVert ? '1' : '0';
  v['--f-point-o'] = c.pointVert ? '1' : '0';

  const { p, r } = positionPoint(c, m, a);
  v['--f-point'] = `translate(${px(p.x)}, ${px(p.y)})`;
  v['--f-point-r'] = px(Math.max(1, r));
  // Sur téléphone, son trajet croise la carte, posée dans la scène au-dessus d'elle : elle s'y cache comme derrière.
  v['--f-point-vu'] = c.pointVu ? (m.carte ? derriere(p, r, m.carte) : 1).toFixed(4) : '0';
  v['--f-rouge'] = '0';
  v['--f-onde'] = c.onde.toFixed(4);
  // L'onde grandit jusqu'à 14 fois la lumière, sans dépasser le quart de la largeur de la scène (téléphone).
  v['--f-onde-s'] = Math.min(14, (m.scene.w * 0.25) / Math.max(1, r)).toFixed(3);
  v['--f-halo'] = c.halo.toFixed(4);

  v['--f-nuage'] = c.nuage.toFixed(4);
  v['--f-voile'] = c.voile.toFixed(4);
  v['--f-carte'] = c.carte.toFixed(4);
  v['--f-phrase'] = c.phrase.toFixed(4);
  v['--f-actions'] = c.actions.toFixed(4);
  v['--f-puces'] = c.puces.toFixed(4);
  return v;
}
