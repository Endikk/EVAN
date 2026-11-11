/**
 * Volet qui glisse depuis la droite, sur le modèle du guide « Comment lire cet écran » : il garde la 3D visible
 * derrière un voile léger. Échap ou un clic sur le voile le ferment ; le focus y entre à l'ouverture, y reste
 * (tabulation en boucle) et revient au bouton d'origine à la fermeture (usePiegeFocus). Échap est marqué traité :
 * il ferme le volet seul, sans fermer en plus le détail de la machine ni recadrer la scène.
 */
import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import { usePiegeFocus } from '@/ui/usePiegeFocus';

interface Props {
  /** Ce dont parle le volet, en petit au-dessus du titre (facultatif). */
  sur?: string;
  titre: string;
  icone: LucideIcon;
  fermer: () => void;
  children: ReactNode;
}

export function Volet({ sur, titre, icone: Icone, fermer, children }: Props) {
  const titreId = useId();
  const volet = useRef<HTMLElement>(null);

  usePiegeFocus(volet, true, fermer);

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
          <button data-autofocus className="btn sm icon ghost" onClick={fermer} aria-label="Fermer" title="Fermer (Échap)">
            <X />
          </button>
        </header>
        <div className="guide-corps">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}
