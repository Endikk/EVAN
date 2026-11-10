/**
 * Le logo d'EVAN suit la barre latérale : dépliée, il est en tête de la barre ; repliée, il passe dans la barre du
 * haut, devant « où l'on est ». En changeant de place, il glisse à l'horizontale de l'une à l'autre (technique FLIP :
 * on note où il était, il s'affiche à sa nouvelle place, puis il part de l'ancienne position pour y arriver). Animations réduites :
 * il change de place sans glisser.
 */
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { isReducedMotion } from '@/store/ui';
import { Brand } from './Brand';
import { useCoquille } from './coquille';

/** Au-delà de ce délai, une ancienne position notée ne vaut plus : le logo apparaît sans glisser. */
const VALIDITE_MS = 600;
const DUREE_MS = 460;

let depart: { rect: DOMRect; t: number } | undefined;

/** À appeler juste avant de replier ou déplier la barre : on note où est le logo. */
export function noterPositionLogo() {
  const el = document.querySelector<HTMLElement>('[data-logo-voyageur]');
  depart = el ? { rect: el.getBoundingClientRect(), t: performance.now() } : undefined;
}

function useMedia(requete: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(requete);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(requete).matches,
    () => false,
  );
}

/** Le logo est dans la barre du haut quand la barre latérale n'affiche que des icônes (repliée ou tablette). */
export function useLogoEnHaut(): boolean {
  const replie = useCoquille((s) => s.replie);
  const tablette = useMedia('(max-width: 1280px) and (min-width: 901px)');
  const telephone = useMedia('(max-width: 900px)');
  return !telephone && (replie || tablette);
}

export function LogoVoyageur({ className = '' }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const de = depart;
    depart = undefined;
    if (!el || !de || performance.now() - de.t > VALIDITE_MS || isReducedMotion()) return;
    // Un glissement horizontal seulement : de gauche à droite en repliant, de droite à gauche en dépliant.
    const dx = de.rect.left - el.getBoundingClientRect().left;
    if (Math.abs(dx) < 1) return;
    el.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], {
      duration: DUREE_MS,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    });
  }, []);

  return (
    <span ref={ref} className={`logo-voyageur ${className}`} data-logo-voyageur>
      <Brand />
    </span>
  );
}
