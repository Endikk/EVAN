/**
 * Volet qui glisse depuis la droite, sur le modèle du guide « Comment lire cet écran » : il garde la 3D visible
 * derrière un voile léger. Échap ou un clic sur le voile le ferment ; le focus y entre à l'ouverture, y reste
 * (tabulation en boucle) et revient au bouton d'origine à la fermeture.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

interface Props {
  /** Ce dont parle le volet, en petit au-dessus du titre (facultatif). */
  sur?: string;
  titre: string;
  icone: LucideIcon;
  fermer: () => void;
  children: ReactNode;
}

const FOCUSABLES = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function Volet({ sur, titre, icone: Icone, fermer, children }: Props) {
  const titreId = useId();
  const volet = useRef<HTMLElement>(null);
  const fermerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    fermerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return fermer();
      if (e.key !== 'Tab' || !volet.current) return;
      const els = [...volet.current.querySelectorAll<HTMLElement>(FOCUSABLES)];
      if (!els.length) return;
      const premier = els[0];
      const dernier = els[els.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      avant?.focus();
    };
  }, [fermer]);

  return createPortal(
    <div className="guide-fond" onMouseDown={fermer}>
      <aside ref={volet} className="guide-volet sv-volet" role="dialog" aria-modal="true" aria-labelledby={titreId} onMouseDown={(e) => e.stopPropagation()}>
        <header className="guide-tete">
          <span className="guide-icone" aria-hidden>
            <Icone />
          </span>
          <div className="grow">
            {sur && <p className="guide-sur">{sur}</p>}
            <h2 id={titreId}>{titre}</h2>
          </div>
          <button ref={fermerRef} className="btn sm icon ghost" onClick={fermer} aria-label="Fermer" title="Fermer (Échap)">
            <X />
          </button>
        </header>
        <div className="guide-corps">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
