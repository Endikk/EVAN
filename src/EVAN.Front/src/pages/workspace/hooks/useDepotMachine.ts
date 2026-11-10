/**
 * Pose des machines sur la scène, à l'étape 3 : glisser-déposer depuis la bibliothèque, ou clic au sol après avoir
 * choisi un type. Une machine se pose à l'intérieur du contour d'un bâtiment, aimantée à la grille.
 */
import type { DragEvent } from 'react';
import { useProject } from '@/store/project';
import { useUi, type Step } from '@/store/ui';
import { useLive } from '@/store/live';
import { pointInPolygon, toLocal, type XY } from '@/geo/geodesy';
import { DND_TYPE, placeMachine } from '@/widgets/scene/placement';
import { useSceneUi, snap, groundPointFromClient } from '@/widgets/scene/sceneState';

/** Type glissé : un type du catalogue, ou un modèle importé (« custom:url|nom »). */
function parsePlacing(t: string): { type: string; url?: string; nom?: string } {
  if (t.startsWith('custom:')) {
    const [url, nom] = t.slice(7).split('|');
    return { type: 'custom', url, nom };
  }
  return { type: t };
}

function dansUnBatiment(pos: XY) {
  const { site, batiments } = useProject.getState();
  return !!site && batiments.some((b) => pointInPolygon(pos, b.contour.map((p) => toLocal(site.repere, p))));
}

/** Gestionnaires du glisser-déposer, à poser sur le calque de la scène. */
export function useDepotMachine(step: Step) {
  return {
    onDragOver(e: DragEvent<HTMLElement>) {
      // Pendant le survol, seul le type MIME est lisible : le type de machine vient du début du glisser.
      const dragType = useSceneUi.getState().dragType;
      if (step !== 3 || !e.dataTransfer.types.includes(DND_TYPE) || !dragType) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const p = groundPointFromClient(e.clientX, e.clientY);
      if (p) useSceneUi.getState().set({ ghost: { type: parsePlacing(dragType).type, pos: [snap(p[0]), snap(p[1])], valid: dansUnBatiment(p) } });
    },
    onDragLeave(e: DragEvent<HTMLElement>) {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) useSceneUi.getState().set({ ghost: undefined });
    },
    onDrop(e: DragEvent<HTMLElement>) {
      e.preventDefault();
      useSceneUi.getState().set({ ghost: undefined });
      const raw = e.dataTransfer.getData(DND_TYPE);
      const p = groundPointFromClient(e.clientX, e.clientY);
      useSceneUi.getState().set({ dragType: undefined });
      if (!raw || !p) return;
      if (!dansUnBatiment(p)) {
        useLive.getState().pushToast({ gravite: 'info', titre: 'Hors du bâtiment', texte: 'Déposez la machine à l’intérieur du contour.' });
        return;
      }
      const pl = parsePlacing(raw);
      placeMachine(pl.type, [snap(p[0]), snap(p[1])], pl.url, pl.nom);
    },
  };
}

/** Clic au sol avec un type choisi dans la bibliothèque : la machine se pose là. */
export function poserMachineChoisie(pos: XY) {
  const placingType = useUi.getState().placingType;
  if (!placingType) return;
  const pl = parsePlacing(placingType);
  placeMachine(pl.type, pos, pl.url, pl.nom);
  useUi.getState().setPlacingType(undefined);
}
