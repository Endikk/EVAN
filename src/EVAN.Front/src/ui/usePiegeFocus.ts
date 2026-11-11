/**
 * Piège de focus d'une fenêtre, d'un volet modal ou d'un menu qui couvre l'écran : à l'ouverture, le focus entre dans
 * le conteneur (l'élément marqué `data-autofocus`, sinon le premier qu'on peut atteindre) ; Tab et Maj+Tab bouclent
 * à l'intérieur ; à la fermeture, le focus revient à l'élément qui l'avait avant (le bouton qui a ouvert).
 *
 * Échap ferme, à condition que personne ne l'ait déjà traité : une bulle d'aide ouverte dans la fenêtre l'arrête
 * avant (écoute en capture sur window, `preventDefault`). L'événement est marqué à son tour, pour que les raccourcis
 * globaux de l'espace de travail ne l'interprètent pas une seconde fois (fermer aussi le détail d'une machine).
 */
import { useEffect, useRef, type RefObject } from 'react';

const ATTEIGNABLES =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function atteignables(conteneur: HTMLElement): HTMLElement[] {
  return [...conteneur.querySelectorAll<HTMLElement>(ATTEIGNABLES)].filter(
    (el) => !el.closest('[inert]') && (el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement),
  );
}

export function usePiegeFocus(ref: RefObject<HTMLElement | null>, actif: boolean, fermer?: () => void): void {
  // La fonction de fermeture change à chaque rendu chez l'appelant : on la lit dans une référence, pour que le piège
  // ne se reconstruise pas (il redonnerait le focus au premier élément à chaque frappe).
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;

  useEffect(() => {
    const conteneur = ref.current;
    if (!actif || !conteneur) return;
    const avant = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!conteneur.contains(document.activeElement)) {
      const cible = conteneur.querySelector<HTMLElement>('[data-autofocus]') ?? atteignables(conteneur)[0] ?? conteneur;
      if (cible === conteneur && !conteneur.hasAttribute('tabindex')) conteneur.setAttribute('tabindex', '-1');
      cible.focus({ preventScroll: true });
    }

    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented || !fermerRef.current) return;
        e.preventDefault();
        fermerRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const liste = atteignables(conteneur);
      if (liste.length === 0) {
        e.preventDefault();
        return;
      }
      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      const actuel = document.activeElement;
      const dehors = !conteneur.contains(actuel);
      if (e.shiftKey && (actuel === premier || dehors)) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && (actuel === dernier || dehors)) {
        e.preventDefault();
        premier.focus();
      }
    };
    // Capture sur document : après les bulles (capture sur window), avant les raccourcis globaux.
    document.addEventListener('keydown', auClavier, true);
    return () => {
      document.removeEventListener('keydown', auClavier, true);
      if (avant && avant.isConnected) avant.focus({ preventScroll: true });
    };
  }, [actif, ref]);
}
