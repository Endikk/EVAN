/**
 * La surface utile de la carte : ce qui se voit vraiment, une fois retirés la barre de recherche, la légende de la
 * visite et les commandes posées dessus. Module léger (types seuls) : la recherche et la visite s'en servent sans
 * charger la carte.
 */
import type * as maplibregl from 'maplibre-gl';

/** Marges de la carte, en pixels : ce que cachent la barre de recherche, la légende de la visite et les commandes. */
export interface Marges {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const MARGE_MIN = 24;
/** Commandes de zoom et d'orientation, en bas à droite. */
const MARGE_COMMANDES = 64;

/**
 * Ce que la carte montre vraiment : sa surface moins ce qui est posé dessus. Sans ces marges, on centrait sur le
 * milieu de la toile, et le sujet tombait sous la barre de recherche ou sous la légende de la visite, toujours « à
 * côté ». `extra` ajoute de l'air autour du sujet.
 */
export function margesCarte(map: maplibregl.Map, extra = 0): Marges {
  const r = map.getContainer().getBoundingClientRect();
  const dessus = (sel: string) => {
    const b = document.querySelector(sel)?.getBoundingClientRect();
    return b && b.width > 0 && b.bottom > r.top && b.top < r.bottom && b.right > r.left && b.left < r.right ? b : undefined;
  };
  const recherche = dessus('.searchbox');
  const legende = dessus('.caption');
  const top = Math.max(MARGE_MIN, recherche ? recherche.bottom - r.top + 12 : 0);
  const bottom = Math.max(MARGE_MIN + 24, legende ? r.bottom - legende.top + 12 : 0);
  // Une fenêtre plus petite que les marges ne doit pas laisser une surface négative.
  const plafond = (v: number, total: number) => Math.min(v, total * 0.35);
  return {
    top: plafond(top + extra, r.height),
    bottom: plafond(bottom + extra, r.height),
    left: plafond(MARGE_MIN + extra, r.width),
    right: plafond(MARGE_COMMANDES + extra, r.width),
  };
}

/** Décalage à donner à un vol vers un point pour qu'il arrive au centre de la surface visible (option `offset`). */
export function decalageCarte(map: maplibregl.Map): [number, number] {
  const m = margesCarte(map);
  return [(m.left - m.right) / 2, (m.top - m.bottom) / 2];
}
