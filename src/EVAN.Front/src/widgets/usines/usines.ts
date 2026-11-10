/**
 * Une organisation, une ou plusieurs usines : passer de l'une à l'autre, en ajouter une.
 * Chaque usine garde son emprise, son plan, ses machines, ses connexions et son état de configuration ;
 * le flux temps réel suit l'usine active (voir Workspace).
 */
import { listUsines, useProject, type ProjectState } from '@/store/project';
import { useUi, espaceOf, type Step } from '@/store/ui';
import { useMapUi, mapHandle } from '@/widgets/carte/mapState';
import { clearLocalisation } from '@/widgets/carte/localisation';
import { fitSite } from '@/widgets/carte/cadrage';
import { goToStep } from '@/widgets/shell/navigation';
import { getSource } from '@/realtime/source';
import { geodesicMeasure } from '@/geo/geodesy';
import { useSceneUi } from '@/widgets/scene/sceneState';

export interface UsineResume {
  id: string;
  nom: string;
  adresse?: string;
  machines: number;
  /** Surface au sol relevée (m², géodésique). */
  surface: number;
  configure: boolean;
}

/** Résumé de chaque usine pour le sélecteur (l'usine active d'après ses données en cours). */
export function resumeUsines(s: ProjectState): UsineResume[] {
  return listUsines(s).map((u) => ({
    id: u.id,
    nom: u.site?.nom ?? 'Nouvelle usine',
    adresse: u.site?.adresse,
    machines: u.machines.length,
    surface: u.batiments.reduce((sum, b) => sum + geodesicMeasure(b.contour).area, 0),
    configure: u.configure,
  }));
}

/**
 * Change d'usine en deux temps. La scène 3D (racine React à part) se vide d'abord d'elle-même, seule à réagir à
 * `switching` ; puis les données de l'usine changent et elle se remplit. Changer les données d'un coup ferait démonter
 * ses étiquettes HTML depuis un rendu du DOM, ce qui casse leurs portails.
 */
async function swap(change: () => void) {
  const scene = useSceneUi.getState();
  scene.set({ switching: true });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    change();
  } finally {
    scene.set({ switching: false });
  }
}

/** Ouvre une autre usine de l'organisation. */
export async function openUsine(id: string) {
  const project = useProject.getState();
  if (id === project.activeId || !project.usines.some((u) => u.id === id)) return;
  await swap(() => useProject.getState().switchUsine(id));
  await enterActiveUsine();
  const site = useProject.getState().site;
  if (site) getSource()?.logEvent({ type: 'action', horodatage: Date.now(), message: `Usine ouverte : ${site.nom}`, auteur: 'Superviseur' });
}

/** Ajoute une usine à l'organisation et commence par la localiser (étape 1). */
export async function addUsine() {
  await swap(() => useProject.getState().addUsine());
  await enterActiveUsine();
}

/**
 * Après un changement d'usine : sélection remise à zéro, puis l'écran qui convient. Une usine configurée s'ouvre en
 * exploitation (on garde l'onglet en cours), une usine en cours de paramétrage reprend la configuration.
 */
async function enterActiveUsine() {
  const { configure, batiments } = useProject.getState();
  const ui = useUi.getState();
  ui.selectMachine(undefined);
  ui.selectZone(undefined);
  ui.selectBatiment(batiments[0]?.id);
  ui.setPlacingType(undefined);
  ui.setZoneTool(null);
  ui.setAccessRequest(null);
  clearLocalisation();
  useMapUi.getState().set({ mode: 'browse', editing: undefined, lastAddedId: undefined, detectError: undefined });

  const target: Step = configure && batiments.length ? (espaceOf(ui.step) === 'exploitation' ? ui.step : 6) : 1;
  if (target !== ui.step) await goToStep(target, { force: true });
  else if (target === 1 && mapHandle.map) fitSite(mapHandle.map, batiments, { pitch: 0, duration: 900 });
  ui.setFocus({ kind: 'site' });
}
