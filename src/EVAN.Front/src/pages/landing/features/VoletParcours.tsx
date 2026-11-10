/**
 * « Comment ça marche », en volet : le parcours en étapes, sans quitter l'accueil (qui ne défile pas). Le volet glisse
 * depuis la droite par-dessus la presse ; lui seul défile si sa hauteur ne suffit pas. En pied, ce qui était plus bas
 * sur l'ancienne page : la démo se visite sans compte, et les langages d'automate qu'EVAN sait lire.
 *
 * Échap ou un clic sur le voile le ferment ; le focus y entre à l'ouverture, y reste (tabulation en boucle) et revient
 * au bouton d'origine à la fermeture.
 */
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Route, X } from 'lucide-react';
import { Term } from '@/ui/explain';
import { PROTOCOLES } from '../lib/sections';
import { Actions } from './Actions';
import { Parcours, TITRE_PARCOURS } from './Parcours';

interface Props {
  fermer(): void;
  assistantTo: string;
  saved: boolean;
}

const FOCUSABLES = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function VoletParcours({ fermer, assistantTo, saved }: Props) {
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
      <aside ref={volet} className="guide-volet lp-volet" role="dialog" aria-modal="true" aria-labelledby={titreId} onMouseDown={(e) => e.stopPropagation()}>
        <header className="guide-tete">
          <span className="guide-icone" aria-hidden="true">
            <Route />
          </span>
          <div className="grow">
            <p className="guide-sur">Comment ça marche</p>
            <h2 id={titreId}>{TITRE_PARCOURS}</h2>
          </div>
          <button ref={fermerRef} type="button" className="btn sm icon ghost" onClick={fermer} aria-label="Fermer">
            <X />
          </button>
        </header>
        <div className="guide-corps lp-volet-corps">
          <Parcours />
          <footer className="lp-volet-pied">
            <p className="lp-volet-demo">
              Le plus simple : ouvrir la démo. Elle montre une organisation d’exemple, Valtiq, avec des machines et des mesures simulées. Elle
              se visite sans compte.
            </p>
            <div className="lp-actions">
              <Actions assistantTo={assistantTo} saved={saved} />
            </div>
            <p className="lp-protocoles">
              Pour brancher vos machines, EVAN lit leur <Term k="automate">automate</Term>, dans le <Term k="protocole">langage</Term> qu’il
              parle : {PROTOCOLES.join(', ')}.
            </p>
          </footer>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
