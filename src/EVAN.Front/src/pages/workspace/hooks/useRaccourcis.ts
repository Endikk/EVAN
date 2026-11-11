/**
 * Raccourcis clavier de l'espace de travail : annuler, rétablir, changer d'écran, tourner ou supprimer une machine.
 *
 * Deux règles partagées avec le reste de l'interface :
 * - un événement déjà traité (`defaultPrevented`) est ignoré. Une bulle, un volet ou un menu qui consomme Échap
 *   appelle `preventDefault()` : Échap le ferme lui, sans fermer en plus le détail de la machine ni recadrer la scène ;
 * - les flèches ne changent d'écran que si le focus n'est sur rien (le corps de la page) ou sur la scène 3D. Sur un
 *   bouton, un graphique, un onglet ou la carte satellite, elles gardent leur sens (et les filtres de l'écran restent).
 */
import { useEffect } from 'react';
import { retirerMachine, useProject } from '@/store/project';
import { useUi, type Step } from '@/store/ui';
import { useMapUi } from '@/widgets/carte/mapState';
import { goToStep } from '@/widgets/shell/navigation';
import { pauseTour, stopTour } from '@/widgets/tour/tour';
import { flechesChangentEcran } from '../lib/clavier';

export function useRaccourcis() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      const ui = useUi.getState();
      // Échap reprend la main sur la visite guidée, même quand une fenêtre de la visite l'a déjà consommé pour se fermer.
      if (e.key === 'Escape' && e.isTrusted && ui.tour.playing) pauseTour();
      if (e.defaultPrevented) return;
      const tag = cible.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || cible.isContentEditable) return;
      // Une liste de choix (ui/Select) garde ses touches : les flèches et Échap n'y changent pas d'écran.
      if (cible.closest?.('[role="combobox"], [role="listbox"]')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useProject.getState().redo();
      } else if (ui.vueOrganisation || ui.replay || ui.assistantOuvert) {
        // Vue d'ensemble, panne rejouée ou assistant ouverts : les flèches ne changent pas d'écran.
      } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !flechesChangentEcran(cible))) {
        // Une flèche sur un bouton, un graphique ou la carte reste à cet élément.
      } else if (e.key === 'ArrowRight' && ui.step !== 5 && ui.step < 9) {
        // Les flèches restent dans l'espace courant (configuration 1-5, exploitation 6-9).
        stopTour();
        void goToStep((ui.step + 1) as Step);
      } else if (e.key === 'ArrowLeft' && ui.step !== 6 && ui.step > 1) {
        stopTour();
        void goToStep((ui.step - 1) as Step);
      } else if (e.key === 'Escape') {
        useMapUi.getState().setMode('browse');
        ui.setPlacingType(undefined);
        ui.setZoneTool(null);
        if (ui.step === 6) {
          ui.selectMachine(undefined);
          ui.setFocus({ kind: 'site' });
        }
      } else if (ui.step === 3 && ui.selectedMachineId) {
        const m = useProject.getState().machines.find((x) => x.id === ui.selectedMachineId);
        if (!m) return;
        if (e.key.toLowerCase() === 'r') useProject.getState().updateMachine(m.id, { rotationDeg: (m.rotationDeg + (e.shiftKey ? 270 : 90)) % 360 });
        // Suppr seulement : Retour arrière, tapé pour corriger un champ qui vient de perdre le focus, ne doit pas
        // retirer une machine. Le retrait s'annonce dans un avis qui propose de l'annuler.
        if (e.key === 'Delete') {
          retirerMachine(m.id);
          ui.selectMachine(undefined);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
