/**
 * Film d'ouverture de l'accueil : ce que vaut chaque canal à une image donnée. Fonctions pures du numéro d'image,
 * sans horloge ni hasard : la même image donne toujours la même page. Les repères viennent de timing.json (grille à
 * 120 BPM, 30 images par temps).
 *
 * Version 9 : la caméra glisse au ras de la presse, du dérouleur au dernier rouleau, pendant qu'une lumière la balaie
 * poste après poste ; les rouleaux démarrent à son passage. Arrivée au dernier rouleau, la lumière s'y pose en point
 * vert, la caméra recule sur toute la presse, et ce point s'envole pour devenir le point final de « Jusqu'au dernier
 * rouleau. » pendant que la page se pose.
 */
import timing from './timing.json';

export const FPS = timing.fps;
export const FIN = timing.duree;
/** Dernière image du titre seul : le film n'en sort pas tant que la presse 3D n'a pas dessiné sa première image. */
export const ATTENTE_TITRE = timing.reperes.attenteTitre;
/** Image où le point attend la presse 3D si elle n'est toujours pas prête. */
export const ATTENTE = timing.reperes.attente;

type Intervalle = readonly [number, number];
const R = timing.reperes as unknown as Record<string, Intervalle | number>;
const iv = (nom: string): Intervalle => R[nom] as Intervalle;
const img = (nom: string): number => R[nom] as number;

const borne = (x: number) => Math.min(1, Math.max(0, x));
/** Avancement de 0 à 1 dans un intervalle d'images. */
export const avance = (f: number, [a, b]: Intervalle) => borne((f - a) / (b - a));

/** Courbe de Bézier cubique, comme `cubic-bezier()` en CSS : x en entrée (le temps), y en sortie. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const dsx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton, puis dichotomie si la pente s'écrase.
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-6) return sy(u);
      const d = dsx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 30; i++) {
      const e = sx(u) - x;
      if (Math.abs(e) < 1e-6) break;
      if (e > 0) hi = u;
      else lo = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

/** Le vocabulaire de mouvement du film : chaque déplacement prend l'une de ces courbes. */
export const COURBES = {
  /** Arrivée : part vite, se pose longuement. */
  arrivee: bezier(0.2, 0.9, 0.1, 1),
  /** Traversée : démarre lentement, file au milieu, atterrit en douceur. */
  traversee: bezier(0.65, 0, 0.15, 1),
  /** Départ : lent au début, part vite (ce qui quitte le cadre). */
  depart: bezier(0.55, 0, 0.8, 0.35),
  /** Envol : part droit vers sa cible, accélère et la frappe (l'impact suit). */
  envol: bezier(0.5, 0, 0.8, 0.55),
  /** Coup : la vitesse est au début (un choc), la fin s'étire. */
  coup: bezier(0.1, 0.75, 0.2, 1),
};

/** Ressort amorti : dépasse un peu sa cible et revient. Vaut exactement 0 et 1 aux bornes. */
export function ressort(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.exp(-6.5 * x) * Math.cos(9 * x);
}

/**
 * Les étapes que la page doit connaître (React ne se redessine qu'à leurs bornes). `reprise` : la presse repart, la
 * pièce s'éteint encore ; `relance` : la pièce est éteinte, la presse finit de remonter.
 */
/** Les étapes que la page doit connaître (React ne se redessine qu'à leurs bornes). */
export type Phase = 'travelling' | 'recul' | 'fin';

export interface Canaux {
  /** Travelling le long de la presse, du dérouleur au dernier rouleau (0 à 1). */
  travelling: number;
  /** Balayage de la lumière, qui accompagne la caméra (0 à 1) ; au-delà, toute la presse est allumée. */
  scan: number;
  /** La presse est entièrement allumée. */
  allumee: boolean;
  /** Recul de la caméra jusqu'à la vue de repos (0 à 1). */
  recul: number;
  /** Vitesse de la presse rapportée à la nominale. */
  facteur: number;
  /** Onde qui part du point d'état quand la lumière touche le dernier rouleau. */
  onde: number;
  /** Respiration du point d'état posé sur le rouleau (0 à 1, périodique). */
  halo: number;
  /** Le point d'état est hors du titre : sur le rouleau, puis en vol vers la phrase. */
  pointVu: boolean;
  /** Vol du point d'état, du moyeu du dernier rouleau jusqu'au point final du titre. */
  vol: number;
  /** Le point final du titre est arrivé : il est vert. */
  pointVert: boolean;
  nuage: number;
  voile: number;
  surtitre: number;
  ligne1: number;
  ligne2: number;
  carte: number;
  phrase: number;
  actions: number;
  puces: number;
  /** Repris par la carte : le film ne montre plus de panne. */
  cartePanne: boolean;
  piece: boolean;
  rouge: boolean;
  phase: Phase;
}

/** Monte sur l'intervalle `monte`, redescend sur l'intervalle `descend`. */
const plateau = (f: number, monte: Intervalle, descend: Intervalle) =>
  Math.min(COURBES.arrivee(avance(f, monte)), 1 - COURBES.traversee(avance(f, descend)));

/** Tous les canaux du film à l'image `f` (fractionnaire possible). Au-delà de FIN, la page au repos. */
export function canaux(f: number): Canaux {
  const fin = f >= FIN;
  const impact = img('impact');
  const [vol0, vol1] = iv('pointVol');
  const [v0, v1] = iv('voile');
  return {
    // Un seul mouvement, régulier au milieu : la caméra glisse le long de la machine.
    travelling: bezier(0.35, 0, 0.55, 1)(avance(f, iv('travelling'))),
    scan: avance(f, iv('scan')),
    allumee: fin || f >= impact,
    recul: fin ? 1 : bezier(0.55, 0, 0.12, 1)(avance(f, iv('recul'))),
    facteur: fin ? 1 : COURBES.traversee(avance(f, iv('elan'))),
    onde: f < impact - 1 ? 0 : COURBES.arrivee(avance(f, [impact - 1, iv('onde')[1]])),
    halo: f < impact ? 0 : 0.5 - 0.5 * Math.cos((2 * Math.PI * (f - impact)) / 40),
    pointVu: f >= impact && f < vol1,
    vol: f < vol0 ? 0 : COURBES.traversee(avance(f, iv('pointVol'))),
    pointVert: fin || f >= vol1,
    nuage: fin ? 1 : COURBES.traversee(avance(f, iv('nuage'))),
    voile: fin ? 0 : plateau(f, [v0, v0 + 15], [v1 - 20, v1]),
    surtitre: COURBES.arrivee(avance(f, iv('surtitre'))),
    ligne1: COURBES.arrivee(avance(f, iv('ligne1'))),
    ligne2: COURBES.arrivee(avance(f, iv('ligne2'))),
    carte: COURBES.arrivee(avance(f, iv('carte'))),
    phrase: COURBES.arrivee(avance(f, iv('phrase'))),
    actions: COURBES.arrivee(avance(f, iv('actions'))),
    puces: COURBES.arrivee(avance(f, iv('puces'))),
    cartePanne: false,
    piece: false,
    rouge: false,
    phase: fin ? 'fin' : f < impact ? 'travelling' : 'recul',
  };
}
