/**
 * Quitter la vue d'ensemble pour une usine : sur l'onglet en cours (« Ouvrir l'usine »), ou directement sur l'écran
 * qui répond au point d'attention (la supervision pour une panne, l'entretien pour un retard).
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
  if (ecran === 'supervision') await goToStep(6, { force: true });
  else if (ecran === 'maintenance') await openPage(8);
}
