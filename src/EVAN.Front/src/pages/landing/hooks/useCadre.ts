import { useLayoutEffect, useState, type RefObject } from 'react';
import type { Rect } from '../lib/cadrage';
import type { Cadre } from '../features/LandingStage';

/** Air laissé entre la presse et ce qu'elle évite, en pixels. */
const AIR = 14;

const croise = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const arrondi = (r: Rect): Rect => ({ x0: Math.round(r.x0), y0: Math.round(r.y0), x1: Math.round(r.x1), y1: Math.round(r.y1) });
const egal = (a: Cadre | null, b: Cadre) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Mesure, dans le repère de la scène, la place laissée à la presse : toute la scène, et les blocs posés dessus (texte,
 * index des vues, carte) que la caméra doit éviter. Remesuré quand l'un d'eux change de taille, ou quand `cle` change
 * (passage en mise en page empilée).
 */
export function useCadre(scene: RefObject<HTMLElement | null>, obstacles: readonly RefObject<HTMLElement | null>[], cle: string): Cadre | null {
  const [cadre, setCadre] = useState<Cadre | null>(null);

  useLayoutEffect(() => {
    const el = scene.current;
    if (!el) return;
    let image = 0;
    const mesurer = () => {
      const s = el.getBoundingClientRect();
      if (s.width < 1 || s.height < 1) return;
      const rel = (r: DOMRect): Rect => ({ x0: r.left - s.left, y0: r.top - s.top, x1: r.right - s.left, y1: r.bottom - s.top });
      const plein: Rect = { x0: 0, y0: 0, x1: s.width, y1: s.height };
      const libre: Rect = { x0: AIR, y0: AIR, x1: s.width - AIR, y1: s.height - AIR };
      const eviter = obstacles
        .map((o) => o.current?.getBoundingClientRect())
        .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0)
        .map((r) => {
          const b = rel(r);
          return { x0: b.x0 - AIR, y0: b.y0 - AIR, x1: b.x1 + AIR, y1: b.y1 + AIR };
        })
        .filter((r) => croise(r, plein))
        .map(arrondi);
      const suivant: Cadre = { libre: arrondi(libre), eviter };
      setCadre((avant) => (egal(avant, suivant) ? avant : suivant));
    };
    // Une seule mesure par image, même si plusieurs blocs changent de taille ensemble.
    const demander = () => {
      cancelAnimationFrame(image);
      image = requestAnimationFrame(mesurer);
    };
    mesurer();
    const ro = new ResizeObserver(demander);
    ro.observe(el);
    for (const o of obstacles) if (o.current) ro.observe(o.current);
    // Les blocs entrent en glissant de quelques pixels : on remesure quand leur animation d'entrée se termine.
    const animes = obstacles.map((o) => o.current).filter((o): o is HTMLElement => !!o);
    for (const o of animes) o.addEventListener('animationend', demander);
    window.addEventListener('resize', demander);
    return () => {
      cancelAnimationFrame(image);
      ro.disconnect();
      for (const o of animes) o.removeEventListener('animationend', demander);
      window.removeEventListener('resize', demander);
    };
  }, [scene, obstacles, cle]);

  return cadre;
}
