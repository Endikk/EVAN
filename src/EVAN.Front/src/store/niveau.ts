/**
 * Niveau affiché sur la scène. Une usine à étages se regarde un niveau à la fois, comme un jeu de plans : le plan et la
 * 3D ne montrent que les zones et les machines du niveau choisi. Sélectionner une machine ou une zone d'un autre
 * niveau y amène ; changer de niveau lâche ce qui était sélectionné ailleurs.
 */
import { niveauDe, nombreNiveaux } from '@/domain/niveaux';
import { useProject } from './project';
import { useUi } from './ui';

const borne = (demande: number, niveaux: number) => Math.min(Math.max(0, demande), niveaux - 1);

/** Nombre de niveaux de l'usine active (1 : tout est de plain-pied, aucun choix de niveau à l'écran). */
export function useNiveauxUsine(): number {
  return useProject((s) => nombreNiveaux(s.batiments));
}

/** Niveau affiché, toujours dans les niveaux de l'usine active. */
export function useNiveauActif(): number {
  const niveaux = useNiveauxUsine();
  return useUi((s) => borne(s.niveau, niveaux));
}

export function niveauActif(): number {
  return borne(useUi.getState().niveau, nombreNiveaux(useProject.getState().batiments));
}

/** Change de niveau à la main : la machine ou la zone sélectionnée sur un autre niveau est lâchée. */
export function choisirNiveau(n: number) {
  const ui = useUi.getState();
  const { machines, zones } = useProject.getState();
  const machine = machines.find((m) => m.id === ui.selectedMachineId);
  const zone = zones.find((z) => z.id === ui.selectedZoneId);
  ui.setNiveau(n);
  if (machine && niveauDe(machine) !== n) ui.selectMachine(undefined);
  if (zone && niveauDe(zone) !== n) ui.selectZone(undefined);
}

function suivre(cible: { niveau?: number } | undefined) {
  if (cible && niveauDe(cible) !== useUi.getState().niveau) useUi.getState().setNiveau(niveauDe(cible));
}

// La scène suit ce qu'on sélectionne ou ce que la caméra va chercher : une panne à l'étage s'ouvre sur l'étage.
useUi.subscribe((s, avant) => {
  const { machines, zones } = useProject.getState();
  if (s.selectedMachineId && s.selectedMachineId !== avant.selectedMachineId) suivre(machines.find((m) => m.id === s.selectedMachineId));
  if (s.selectedZoneId && s.selectedZoneId !== avant.selectedZoneId) suivre(zones.find((z) => z.id === s.selectedZoneId));
  if (s.focus !== avant.focus && s.focus.kind !== 'site') {
    const id = s.focus.machineId;
    suivre(machines.find((m) => m.id === id));
  }
});

// Une autre usine s'ouvre sur son rez-de-chaussée.
useProject.subscribe((s, avant) => {
  if (s.activeId !== avant.activeId && useUi.getState().niveau !== 0) useUi.getState().setNiveau(0);
});
