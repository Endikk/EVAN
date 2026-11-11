/**
 * Rendre le focus après une action qui fait disparaître ce qui l'avait : une ligne d'entretien consignée quitte
 * « À faire », une ligne planifiée change de rang. Sans cela, le focus tombait sur le corps de la page et le clavier
 * repartait du haut de l'écran.
 *
 * On note, avant l'action, l'élément qui a le focus et ses repères : la ligne qui le porte (`data-retour`), sa place
 * dans sa liste, ses blocs parents. Après l'action, on rend le focus au même élément s'il est encore là, sinon au même
 * bouton de la même ligne ailleurs (elle a changé de rang), sinon à la ligne qui a pris sa place, sinon au titre du
 * bloc qui la contenait.
 */
import { useEffect } from 'react';

const ATTEIGNABLES = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focaliser(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement) || !el.isConnected) return false;
  if (!el.matches(ATTEIGNABLES) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: false });
  return document.activeElement === el;
}

/** Note où est le focus et rend une fonction qui le remet au bon endroit, à appeler une fois l'écran redessiné. */
export function memoriserRetour(depuis: Element | null = document.activeElement): () => void {
  const avant = depuis instanceof HTMLElement && depuis !== document.body ? depuis : null;
  if (!avant) return () => undefined;
  const porteur = avant.closest<HTMLElement>('[data-retour]');
  const cle = porteur?.dataset.retour;
  const rang = porteur ? [...porteur.querySelectorAll(ATTEIGNABLES)].indexOf(avant) : -1;
  const li = avant.closest('li');
  const liste = li?.parentElement ?? null;
  const index = li && liste ? [...liste.children].indexOf(li) : -1;
  const blocs: HTMLElement[] = [];
  for (let el = avant.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.matches('section, article, [role="dialog"], main')) blocs.push(el);
  }

  return () => {
    if (avant.isConnected) {
      focaliser(avant);
      return;
    }
    if (cle) {
      const meme = [...document.querySelectorAll<HTMLElement>('[data-retour]')].find((x) => x.dataset.retour === cle);
      if (meme && focaliser(meme.querySelectorAll(ATTEIGNABLES)[Math.max(0, rang)])) return;
    }
    if (liste?.isConnected && liste.children.length) {
      const voisin = liste.children[Math.min(index, liste.children.length - 1)];
      if (focaliser(voisin.querySelector(ATTEIGNABLES))) return;
    }
    const bloc = blocs.find((b) => b.isConnected);
    if (bloc) focaliser(bloc.querySelector('h1, h2, h3, h4') ?? bloc);
  };
}

/** Comme memoriserRetour, mais n'agit que si le focus s'est perdu (sur le corps de la page) entre-temps. */
export function rendreSiPerdu(rendre: () => void) {
  window.setTimeout(() => {
    const actif = document.activeElement;
    if (!actif || actif === document.body) rendre();
  }, 0);
}

/**
 * Pour une fenêtre ou un volet : note le focus à l'ouverture et le rend à la fermeture s'il s'est perdu. À appeler
 * avant usePiegeFocus, pour noter l'élément d'origine avant que le piège ne déplace le focus. Noté dans un effet, après
 * la fermeture d'un éventuel volet d'où l'on vient (qui a déjà rendu le focus à sa ligne).
 */
export function useRetourFocus() {
  useEffect(() => {
    const rendre = memoriserRetour();
    return () => rendreSiPerdu(rendre);
  }, []);
}
