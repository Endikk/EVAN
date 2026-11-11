/**
 * Garde d'une saisie non enregistrée, commune au bon de travail et à la planification. Un clic à côté de la fenêtre
 * ne la ferme plus dès qu'un champ a changé (on perdait le bon en visant le bouton) ; Échap demande d'abord si l'on
 * veut vraiment perdre ce qui a été saisi. Les boutons « Annuler » et « Fermer » restent des choix explicites.
 */
import { useEffect, useId, useRef, useState } from 'react';

export function useGardeSaisie(modifie: boolean, fermer: () => void) {
  const [quitter, setQuitter] = useState(false);
  return {
    quitter,
    rester: () => setQuitter(false),
    /** Échap : ferme si rien n'a changé ; sinon pose la question, et un second Échap revient à la saisie. */
    echap: () => (!modifie ? fermer() : setQuitter((q) => !q)),
    /** Clic sur le fond : ignoré dès qu'un champ a changé. */
    fond: () => {
      if (!modifie) fermer();
    },
  };
}

/** La question, à la place des boutons du pied de la fenêtre. Le focus va sur « Continuer la saisie », le choix sûr. */
export function QuestionQuitter({ rester, quitter }: { rester(): void; quitter(): void }) {
  const id = useId();
  const resterRef = useRef<HTMLButtonElement>(null);
  useEffect(() => resterRef.current?.focus(), []);
  return (
    <div className="iv-quitter" role="alertdialog" aria-labelledby={id}>
      <p id={id}>Fermer sans enregistrer ? Ce que vous avez saisi sera perdu.</p>
      <div className="iv-quitter-choix">
        <button type="button" className="btn" onClick={quitter}>
          Fermer sans enregistrer
        </button>
        <button ref={resterRef} type="button" className="btn primary" onClick={rester}>
          Continuer la saisie
        </button>
      </div>
    </div>
  );
}
