/**
 * Quitter la vue d'ensemble pour une usine : « Ouvrir l'usine » mène toujours à sa supervision (elle menait tantôt à
 * la supervision, tantôt au dernier onglet ouvert), le bouton du point d'attention directement à l'écran qui y répond
 * (la supervision pour une panne, l'entretien pour un retard).
 *
 * Le bouton cliqué disparaît avec la vue d'ensemble : le focus passe au titre de l'écran ouvert, pour que le clavier
 * reparte de là et qu'un lecteur d'écran annonce où l'on est.
 */
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { goToStep, openPage } from '@/widgets/shell/navigation';
import { openUsine } from '@/widgets/usines/usines';
import { stopTour } from '@/widgets/tour/tour';
import type { ActionAttention } from '../lib/lecture';

export async function ouvrirUsine(id: string, ecran?: ActionAttention) {
  stopTour();
  useUi.getState().setVueOrganisation(false);
  if (id !== useProject.getState().activeId) await openUsine(id);
  if (ecran === 'maintenance') await openPage(8);
  else await goToStep(6, { force: true });
  focaliserTitre();
}

/** Titre de l'écran (barre du haut), une fois l'écran dessiné. */
function focaliserTitre() {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const titre = document.querySelector<HTMLElement>('h1.ecran-titre');
      if (!titre) return;
      if (!titre.hasAttribute('tabindex')) titre.setAttribute('tabindex', '-1');
      titre.focus({ preventScroll: true });
    }),
  );
}
