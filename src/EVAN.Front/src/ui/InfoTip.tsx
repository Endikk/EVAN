/**
 * Aide contextuelle : la seule forme d'aide de l'interface. Deux déclencheurs, une même bulle :
 * - le « ? » juste après un titre de bloc ;
 * - le libellé lui-même (prop `texte`), souligné en pointillé, pour un chiffre ou une ligne de liste : l'écran ne
 *   se couvre pas de « ? » et chaque chiffre garde son explication.
 * L'explication (définition, méthode, source) s'ouvre au survol, au focus clavier ou au toucher, au lieu d'occuper
 * l'écran en permanence. Rien d'indispensable pour agir n'y est caché.
 *
 * La bulle est rendue dans le body (jamais rognée par une carte qui défile). On peut passer la souris dessus sans
 * qu'elle se ferme, Échap la ferme (WCAG 1.4.13). Échap ne ferme qu'elle : il est lu en capture, avant les volets et
 * les raccourcis globaux, puis marqué traité (`preventDefault`).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleHelp } from 'lucide-react';

const LARGEUR = 300;
const MARGE = 8;
/** Délai avant fermeture quand la souris quitte le « ? » : le temps de rejoindre la bulle. */
const SORTIE_MS = 140;

interface Props {
  children: ReactNode;
  label?: string;
  /** Libellé qui sert lui-même de déclencheur, à la place du « ? ». */
  texte?: ReactNode;
}

export function InfoTip({ children, label = 'Explication', texte }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>();
  const btn = useRef<HTMLButtonElement>(null);
  const bulle = useRef<HTMLDivElement>(null);
  const minuterie = useRef(0);
  const id = useId();

  const ouvrir = useCallback(() => {
    window.clearTimeout(minuterie.current);
    setOpen(true);
  }, []);
  const fermerBientot = useCallback(() => {
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setOpen(false), SORTIE_MS);
  }, []);

  /** Place la bulle sous le « ? » (au-dessus en bas d'écran) ; renvoie faux si le « ? » est sorti de l'écran. */
  const placer = useCallback(() => {
    if (!btn.current) return false;
    const r = btn.current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const left = Math.max(MARGE, Math.min(r.left + r.width / 2 - LARGEUR / 2, window.innerWidth - LARGEUR - MARGE));
    setPos(r.bottom + 200 > window.innerHeight ? { left, bottom: window.innerHeight - r.top + 6 } : { left, top: r.bottom + 6 });
    return true;
  }, []);

  useLayoutEffect(() => {
    if (open) placer();
  }, [open, placer]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    // Un défilement (y compris celui que provoque le focus clavier) déplace la bulle avec son « ? » au lieu de la
    // fermer ; elle ne se ferme que si le « ? » sort de l'écran.
    const suivre = () => {
      if (!placer()) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !bulle.current?.contains(t)) close();
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
  }, [open, placer]);

  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={texte === undefined ? 'infotip' : 'infotip-texte'}
        aria-label={texte === undefined ? label : undefined}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        onPointerEnter={(e) => e.pointerType === 'mouse' && ouvrir()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && fermerBientot()}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && ouvrir()}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Ne déclenche pas l'action de la carte qui la contient. À la souris, le survol l'a déjà ouverte :
          // le clic la garde ouverte ; au toucher et au clavier, il ouvre et referme.
          e.stopPropagation();
          if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') ouvrir();
          else setOpen((v) => !v);
        }}
      >
        {texte === undefined ? (
          <CircleHelp aria-hidden />
        ) : (
          // Le nom lu commence par le libellé visible (WCAG 2.5.3) et dit qu'il ouvre une explication.
          <>
            {texte}
            <span className="sr-only"> : explication</span>
          </>
        )}
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={bulle}
            id={id}
            role="tooltip"
            className="infotip-pop"
            style={{ ...pos, width: LARGEUR }}
            onPointerEnter={(e) => e.pointerType === 'mouse' && ouvrir()}
            onPointerLeave={(e) => e.pointerType === 'mouse' && fermerBientot()}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
