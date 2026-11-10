/** Raccourcis clavier de l'espace de travail : annuler, rétablir, changer d'écran, tourner ou supprimer une machine. */
import { useEffect } from 'react';
import { useProject } from '@/store/project';
import { useUi, type Step } from '@/store/ui';
import { useMapUi } from '@/widgets/carte/mapState';
import { goToStep } from '@/widgets/shell/navigation';
import { stopTour } from '@/widgets/tour/tour';

export function useRaccourcis() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement;
      const tag = cible.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Une liste de choix (ui/Select) garde ses touches : les flèches et Échap n'y changent pas d'écran.
      if (cible.closest?.('[role="combobox"], [role="listbox"]')) return;
      const ui = useUi.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) useProject.getState().redo();
        else useProject.getState().undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        useProject.getState().redo();
      } else if (ui.vueOrganisation || ui.replay || ui.assistantOuvert) {
        // Vue d'ensemble, panne rejouée ou assistant ouverts : les flèches ne changent pas d'écran.
      } else if (e.key === 'ArrowRight' && !e.altKey && ui.step !== 5 && ui.step < 9) {
        // Les flèches restent dans l'espace courant (configuration 1-5, exploitation 6-9).
        stopTour();
        void goToStep((ui.step + 1) as Step);
      } else if (e.key === 'ArrowLeft' && !e.altKey && ui.step !== 6 && ui.step > 1) {
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
        if (e.key === 'Delete' || e.key === 'Backspace') {
          useProject.getState().removeMachine(m.id);
          ui.selectMachine(undefined);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
