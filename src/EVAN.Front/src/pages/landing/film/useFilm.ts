/**
 * Branche le film d'ouverture sur la page : décide s'il joue, mesure les places au repos, réécrit les variables CSS
 * à chaque image et le termine au premier geste du visiteur.
 *
 * Il joue une fois par navigateur et par version du film, jamais avec les animations réduites. `?film=1` le force, `?film=0` l'empêche,
 * `?film=capture` le laisse immobile pour la relecture image par image (window.__evanFilm).
 */
import { useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react';
import { FIN } from './timeline';
import timing from './timing.json';
import { variables, type Boite, type Mesures } from './geometrie';
import { creerHorloge, type Horloge, type Mode } from './horloge';
import type { Phase } from './timeline';

/** Une fois par navigateur et par version du film : un outil qu'on rouvre chaque matin ne rejoue pas son ouverture. */
const CLE = `evan.accueil.film.v${timing.version}`;
const GESTES = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

export interface FilmRefs {
  lp: RefObject<HTMLElement | null>;
  hero: RefObject<HTMLElement | null>;
  scene: RefObject<HTMLElement | null>;
  point: RefObject<HTMLElement | null>;
  puce: RefObject<HTMLElement | null>;
  carte: RefObject<HTMLElement | null>;
  pastille: RefObject<HTMLElement | null>;
}

declare global {
  interface Window {
    __evanFilm?: { pret: Promise<void>; aller(f: number): void; fin: number };
  }
}

/** Sans WebGL, pas de presse : le film n'aurait rien à montrer. */
function webgl(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    // Le contexte d'essai est rendu tout de suite : le navigateur n'en accorde qu'un petit nombre.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}

function decider(reduit: boolean): Mode | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('film');
  // La relecture image par image fige la page : elle n'existe qu'en développement.
  if (q === 'capture' && import.meta.env.DEV) return 'capture';
  if (q === '0' || q === 'capture' || reduit || !webgl()) return null;
  if (q === '1') return 'lecture';
  try {
    if (window.localStorage.getItem(CLE)) return null;
  } catch {
    // Stockage refusé : le film joue, il ne saura simplement pas qu'il a déjà joué.
  }
  return 'lecture';
}

function retenir() {
  try {
    window.localStorage.setItem(CLE, '1');
  } catch {
    // Stockage refusé : rien à retenir.
  }
}

const rel = (r: DOMRect, s: DOMRect): Boite => ({ x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height });

/** Places au repos, dans le repère de la scène. Appelée avant toute variable du film : rien n'est encore déplacé. */
function mesurer(refs: FilmRefs): Mesures | null {
  const scene = refs.scene.current?.getBoundingClientRect();
  const hero = refs.hero.current?.getBoundingClientRect();
  const point = refs.point.current?.getBoundingClientRect();
  // L'étiquette se mesure repliée, à sa ligne « CF-02 Dorure à froid » : la consigne se déplie au-dessus.
  const pastille = (refs.pastille.current?.firstElementChild ?? refs.pastille.current)?.getBoundingClientRect();
  if (!scene || !hero || !point || scene.width < 1 || point.width < 1) return null;
  const puce = refs.puce.current?.getBoundingClientRect();
  const carte = refs.carte.current?.getBoundingClientRect();
  // Hauteur de la consigne dépliée : elle se déplie sur toute sa course, ni plus vite ni plus loin.
  const consigne = refs.pastille.current?.lastElementChild as HTMLElement | null | undefined;
  return {
    scene: rel(scene, hero),
    point: { x: point.left + point.width / 2 - scene.left, y: point.top + point.height / 2 - scene.top, r: point.width / 2 },
    puce: puce && puce.width > 0 ? rel(puce, scene) : null,
    carte: carte && carte.width > 0 ? rel(carte, scene) : null,
    pastille: { w: pastille?.width || 150, h: pastille?.height || 30, consigne: consigne?.scrollHeight || 24 },
  };
}

const rien = () => () => {};

export function useFilm(refs: FilmRefs, reduit: boolean): { horloge: Horloge | null; phase: Phase } {
  const [horloge] = useState(() => {
    const mode = decider(reduit);
    return mode ? creerHorloge(mode) : null;
  });
  const phase = useSyncExternalStore(horloge ? horloge.abonner : rien, () => (horloge ? horloge.phase() : 'fin'));

  useLayoutEffect(() => {
    if (!horloge) return;
    let mesures: Mesures | null = null;
    let fini = false;
    const ecrites = new Map<string, string>();
    const ecrire = () => {
      const el = refs.hero.current;
      if (!el || !mesures) return;
      for (const [k, val] of Object.entries(variables(horloge.canaux(), mesures, horloge.ancres))) {
        if (ecrites.get(k) === val) continue;
        ecrites.set(k, val);
        el.style.setProperty(k, val);
      }
    };
    const desabonner = horloge.abonner(ecrire);
    const passer = () => horloge.passer();

    // Polices chargées d'abord : la taille du titre en dépend.
    void document.fonts.ready.then(() => {
      if (fini) return;
      mesures = mesurer(refs);
      if (!mesures) return horloge.passer();
      ecrire();
      refs.lp.current?.setAttribute('data-film-pret', '');
      if (horloge.mode === 'capture') {
        window.__evanFilm = { pret: horloge.pretPromesse, aller: (f) => horloge.aller(f), fin: FIN };
        return;
      }
      retenir();
      horloge.demarrer();
    });

    // Les places mesurées ne valent plus si la largeur change : la page se pose. La barre d'adresse d'un téléphone
    // qui se replie ne change que la hauteur : le film continue.
    const largeur = window.innerWidth;
    const redimensionner = () => {
      if (window.innerWidth !== largeur) passer();
    };
    if (horloge.mode === 'lecture') {
      for (const g of GESTES) window.addEventListener(g, passer, { capture: true, passive: true });
      window.addEventListener('resize', redimensionner);
    }
    return () => {
      fini = true;
      desabonner();
      horloge.arreter();
      for (const g of GESTES) window.removeEventListener(g, passer, { capture: true });
      window.removeEventListener('resize', redimensionner);
      delete window.__evanFilm;
    };
    // Les refs sont stables ; l'horloge est créée une fois.
  }, [horloge, refs]);

  // Animations réduites demandées en cours de route : le film s'arrête et la page se pose.
  useLayoutEffect(() => {
    if (reduit && horloge?.mode === 'lecture') horloge.passer();
  }, [reduit, horloge]);

  return { horloge, phase };
}
