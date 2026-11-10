/** Bulle d'explication rendue dans le body, placée sous son ancre (au-dessus en bas d'écran), fermée au défilement. */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

const MARGE = 8;
const HAUTEUR_PROBABLE = 200;

export interface PositionBulle {
  left: number;
  top?: number;
  bottom?: number;
}

export function useBulle(ancre: RefObject<HTMLElement | null>, ouverte: boolean, fermer: () => void, largeur: number) {
  const [pos, setPos] = useState<PositionBulle>();

  useLayoutEffect(() => {
    if (!ouverte || !ancre.current) return setPos(undefined);
    const r = ancre.current.getBoundingClientRect();
    const left = Math.max(MARGE, Math.min(r.left + r.width / 2 - largeur / 2, window.innerWidth - largeur - MARGE));
    setPos(r.bottom + HAUTEUR_PROBABLE > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
  }, [ouverte, ancre, largeur]);

  useEffect(() => {
    if (!ouverte) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
    const onDown = (e: PointerEvent) => !ancre.current?.contains(e.target as Node) && fermer();
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', fermer, true);
    window.addEventListener('resize', fermer);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', fermer, true);
      window.removeEventListener('resize', fermer);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [ouverte, ancre, fermer]);

  return pos;
}
