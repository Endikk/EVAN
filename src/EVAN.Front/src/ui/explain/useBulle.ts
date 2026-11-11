/**
 * Bulle d'explication rendue dans le body, placée sous son ancre (au-dessus en bas d'écran).
 *
 * Elle suit son ancre quand la page défile, et ne se ferme que si l'ancre sort de l'écran (WCAG 1.4.13 : le contenu
 * qui apparaît au survol reste tant qu'on en a besoin). Échap la ferme seule : l'écoute se fait en capture sur window,
 * avant les fenêtres et les raccourcis globaux, et l'événement est marqué traité (`preventDefault`) pour qu'Échap ne
 * ferme pas en plus le volet qui contient la bulle, ni le détail d'une machine.
 */
import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from 'react';

const MARGE = 8;
const HAUTEUR_PROBABLE = 200;

export interface PositionBulle {
  left: number;
  top?: number;
  bottom?: number;
}

/** Rectangle de l'ancre, à la façon de getBoundingClientRect. */
export interface RectAncre {
  left: number;
  width: number;
  top: number;
  bottom: number;
}

/**
 * Place une bulle de la largeur donnée sous son ancre, ou au-dessus en bas d'écran, sans déborder sur les côtés.
 * Rend undefined si l'ancre est sortie de l'écran (la bulle se ferme alors).
 */
export function placerBulle(r: RectAncre, largeur: number, ecran: { largeur: number; hauteur: number }): PositionBulle | undefined {
  if (r.bottom < 0 || r.top > ecran.hauteur) return undefined;
  const left = Math.max(MARGE, Math.min(r.left + r.width / 2 - largeur / 2, ecran.largeur - largeur - MARGE));
  return r.bottom + HAUTEUR_PROBABLE > ecran.hauteur ? { left, bottom: ecran.hauteur - r.top + 6 } : { left, top: r.bottom + 6 };
}

export function useBulle(
  ancre: RefObject<HTMLElement | null>,
  ouverte: boolean,
  fermer: () => void,
  largeur: number,
  bulle?: RefObject<HTMLElement | null>,
) {
  const [pos, setPos] = useState<PositionBulle>();

  const placer = useCallback(() => {
    if (!ancre.current) return undefined;
    const p = placerBulle(ancre.current.getBoundingClientRect(), largeur, { largeur: window.innerWidth, hauteur: window.innerHeight });
    setPos(p);
    return p;
  }, [ancre, largeur]);

  useLayoutEffect(() => {
    if (!ouverte) return setPos(undefined);
    placer();
  }, [ouverte, placer]);

  useEffect(() => {
    if (!ouverte) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      fermer();
    };
    const suivre = () => {
      if (!placer()) fermer();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!ancre.current?.contains(t) && !bulle?.current?.contains(t)) fermer();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', suivre, true);
    window.addEventListener('resize', suivre);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', suivre, true);
      window.removeEventListener('resize', suivre);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [ouverte, ancre, bulle, fermer, placer]);

  return pos;
}
