/**
 * Volet latéral qui raconte l'intérieur d'une chose (ici, le calcul d'une économie). Mêmes styles que le guide de
 * l'écran : il glisse depuis la droite, Échap ou un clic à côté le ferme, et le focus revient au bouton qui l'a ouvert.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface Props {
  surtitre: string;
  titre: string;
  icone: ReactNode;
  fermer: () => void;
  children: ReactNode;
}

export function Volet({ surtitre, titre, icone, fermer, children }: Props) {
  const titreId = useId();
  const fermerRef = useRef<HTMLButtonElement>(null);
  const voletRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    fermerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return fermer();
      if (e.key !== 'Tab' || !voletRef.current) return;
      // Le focus tourne dans le volet tant qu'il est ouvert : derrière, l'écran est inerte.
      const focusables = voletRef.current.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
      const premier = focusables[0];
      const dernier = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === premier) {
        e.preventDefault();
        dernier?.focus();
      } else if (!e.shiftKey && document.activeElement === dernier) {
        e.preventDefault();
        premier?.focus();
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
      <aside ref={voletRef} className="guide-volet en-volet" role="dialog" aria-modal="true" aria-labelledby={titreId} onMouseDown={(e) => e.stopPropagation()}>
        <header className="guide-tete">
          <span className="guide-icone" aria-hidden>
            {icone}
          </span>
          <div className="grow">
            <p className="guide-sur">{surtitre}</p>
            <h2 id={titreId}>{titre}</h2>
          </div>
          <button ref={fermerRef} type="button" className="btn sm icon ghost" onClick={fermer} aria-label="Fermer le volet" title="Fermer (Échap)">
            <X />
          </button>
        </header>
        <div className="guide-corps">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
