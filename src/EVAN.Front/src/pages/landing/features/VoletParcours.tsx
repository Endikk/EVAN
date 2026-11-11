/**
 * « Comment ça marche », en volet : le parcours en étapes, sans quitter l'accueil (qui ne défile pas). Le volet glisse
 * depuis la droite par-dessus la presse ; lui seul défile si sa hauteur ne suffit pas. En pied, ce qui était plus bas
 * sur l'ancienne page : la démo se visite sans compte, et les langages d'automate qu'EVAN sait lire.
 *
 * Échap ou un clic sur le voile le ferment ; le focus y entre à l'ouverture (sur « Fermer »), y reste (tabulation en
 * boucle) et revient au bouton d'origine à la fermeture.
 */
import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Route, X } from 'lucide-react';
import { Term } from '@/ui/explain';
import { usePiegeFocus } from '@/ui/usePiegeFocus';
import type { ActionUsine } from '../lib/actions';
import { PROTOCOLES } from '../lib/sections';
import { Actions } from './Actions';
import { Parcours, TITRE_PARCOURS } from './Parcours';

interface Props {
  fermer(): void;
  usine: ActionUsine;
}

export function VoletParcours({ fermer, usine }: Props) {
  const titreId = useId();
  const volet = useRef<HTMLElement>(null);
  // Piège de focus commun aux fenêtres : une bulle d'aide ouverte dans le volet (« automate ») consomme Échap avant
  // lui, et seule la bulle se ferme.
  usePiegeFocus(volet, true, fermer);

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
          <button type="button" className="btn sm icon ghost" onClick={fermer} aria-label="Fermer" data-autofocus>
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
              <Actions usine={usine} />
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
