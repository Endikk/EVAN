/**
 * Navigation entre étapes, avec la transition continue carte satellite → plan 3D :
 * la carte s'incline et s'aligne sur le bâtiment, puis la scène 3D reprend exactement ce point de vue.
 */
import { useProject } from '@/store/project';
import { useEnregistrement } from '@/store/enregistrement';
import { useUi, isReducedMotion, espaceOf, type Step } from '@/store/ui';
import { useLive } from '@/store/live';
import { computeFrame } from '@/geo/geodesy';
import { handoff, mapHandle, snapshotMapCamera, useMapUi } from '@/widgets/carte/mapState';
import { fitSite } from '@/widgets/carte/cadrage';
import { getSource } from '@/realtime/source';
import { switchView } from '@/widgets/scene/planView';
import type { Alarme } from '@/domain/types';
import type { Ecran } from './ecrans';
// Dépendance circulaire sans risque : chacun n'appelle les fonctions de l'autre qu'à l'exécution.
import { openUsine } from '@/widgets/usines/usines';

function waitMoveEnd(timeout = 4000): Promise<void> {
  const map = mapHandle.map;
  if (!map) return Promise.resolve();
  return new Promise((resolve) => {
    const t = window.setTimeout(resolve, timeout);
    map.once('moveend', () => {
      window.clearTimeout(t);
      resolve();
    });
  });
}

/**
 * Change d'étape. Depuis l'exploitation, revenir à une étape de configuration passe par l'accès explicite
 * (fenêtre de confirmation), sauf pour la visite guidée (force).
 */
export async function goToStep(n: Step, opts: { force?: boolean } = {}) {
  const ui = useUi.getState();
  const cur = ui.step;
  // Un onglet de l'usine referme la vue d'ensemble de l'organisation, comme une étape ouverte d'office (accès accordé,
  // visite, retour du navigateur). Une étape de paramétrage simplement demandée la garde ouverte sous la fenêtre d'accès.
  if (ui.vueOrganisation && (opts.force || espaceOf(n) === 'exploitation')) ui.setVueOrganisation(false);
  if (n === cur) return;
  if (!opts.force && espaceOf(n) === 'configuration' && espaceOf(cur) === 'exploitation') {
    ui.setAccessRequest(n);
    return;
  }
  const { batiments, site, machines } = useProject.getState();
  if (n > 1 && (!site || !batiments.length)) {
    useLive.getState().pushToast({ gravite: 'info', titre: 'Commencez par le bâtiment', texte: 'Recherchez l’adresse puis cliquez sur votre bâtiment.' });
    return;
  }
  if (cur === 1 && n > 1) {
    useMapUi.getState().setMode('browse');
    const map = mapHandle.map;
    if (map && site && !isReducedMotion()) {
      const frame = site.repere ?? computeFrame(batiments[0].contour);
      fitSite(map, batiments, { pitch: 56, bearing: -frame.angleDeg, duration: 1500, padding: 70 });
      await waitMoveEnd(2200);
      handoff.snapshot = snapshotMapCamera();
    }
  }
  if (n === 1 && mapHandle.map) {
    const map = mapHandle.map;
    window.setTimeout(() => {
      map.resize();
      fitSite(map, useProject.getState().batiments, { pitch: 0, duration: 900 });
    }, 60);
  }
  ui.setStep(n);
  if (n === 2 || n === 3) ui.setFocus({ kind: 'site' });
  if (n === 4 || n === 5) {
    const id = ui.selectedMachineId ?? machines[0]?.id;
    if (id) {
      ui.selectMachine(id);
      if (n === 4) ui.setFocus({ kind: 'machine', machineId: id });
    }
  }
  if (n === 6) {
    void switchView('3d');
    ui.setFocus({ kind: 'site' });
  }
}

/** Vue d'ensemble de l'organisation : toutes ses usines côte à côte. */
export function openOrganisation() {
  const ui = useUi.getState();
  ui.selectMachine(undefined);
  ui.setVueOrganisation(true);
}

/** Ouvre l'écran demandé par l'adresse (retour ou avance du navigateur). */
export async function ouvrirEcran(e: Ecran) {
  if (e === 'organisation') openOrganisation();
  else await goToStep(e, { force: true });
}

/** Écran d'exploitation ouvert sur une machine (historique, carnet de maintenance, énergie). */
export async function openPage(n: 7 | 8 | 9, machineId?: string) {
  useUi.getState().setPageMachineId(machineId);
  await goToStep(n, { force: true });
}

/** Montre un organe dans le plan 3D de la supervision (depuis le carnet ou le diagnostic d'un défaut répétitif). */
export async function showOrgan(machineId: string, organeId: string) {
  const ui = useUi.getState();
  ui.setVueOrganisation(false);
  if (ui.step !== 6) await goToStep(6, { force: true });
  window.setTimeout(() => {
    void switchView('3d');
    useUi.getState().selectMachine(machineId);
    useUi.getState().setFocus({ kind: 'organe', machineId, organeId });
  }, 300);
}

/** Montre une machine dans la supervision, en ouvrant au besoin l'usine de l'organisation où elle se trouve. */
export async function showMachine(machineId: string) {
  const project = useProject.getState();
  const ui = useUi.getState();
  ui.setVueOrganisation(false);
  if (!project.machines.some((m) => m.id === machineId)) {
    const usine = project.usines.find((u) => u.machines.some((m) => m.id === machineId));
    if (!usine) return;
    await openUsine(usine.id);
  }
  if (useUi.getState().step !== 6) await goToStep(6, { force: true });
  window.setTimeout(() => {
    void switchView('3d');
    useUi.getState().selectMachine(machineId);
    useUi.getState().setFocus({ kind: 'machine', machineId });
  }, 300);
}

/** Revoir une panne (alarme de l'historique ou résolue pendant la session). */
export function openReplay(a: Alarme) {
  useUi.getState().setReplay(a);
}

/** Ouvre la fenêtre d'accès à la configuration. */
export function requestConfiguration(step: Step = 1) {
  useUi.getState().setAccessRequest(step);
}

/** Accès accordé : passage en configuration, tracé dans le journal. */
export async function unlockConfiguration() {
  const ui = useUi.getState();
  const step = ui.accessRequest ?? 1;
  ui.setAccessRequest(null);
  getSource()?.logEvent({ type: 'action', horodatage: Date.now(), message: 'Configuration de l’usine ouverte', auteur: 'Superviseur' });
  ui.selectMachine(undefined);
  await goToStep(step, { force: true });
}

/** Fin de configuration : l'usine est prête, on bascule sur la supervision. */
export async function finishConfiguration() {
  const { batiments, machines } = useProject.getState();
  if (!batiments.length) {
    useLive.getState().pushToast({ gravite: 'info', titre: 'Il manque le bâtiment', texte: 'Relevez au moins une emprise avant de terminer.' });
    return;
  }
  useProject.getState().setConfigure(true);
  useUi.getState().setPlacingType(undefined);
  useUi.getState().setZoneTool(null);
  // Organisation d'un compte : la configuration part tout de suite vers le serveur. Refusée, l'écran le dit et garde
  // le détail des champs dans l'état d'enregistrement de la barre du haut.
  if (useProject.getState().serveur && !(await useEnregistrement.getState().enregistrer())) {
    const erreur = useEnregistrement.getState().erreur;
    useLive.getState().pushToast({
      gravite: 'critique',
      titre: 'Configuration non enregistrée sur le serveur',
      texte: erreur?.champs[0]?.message ?? erreur?.message ?? 'Le serveur EVAN n’a pas répondu.',
    });
  }
  await goToStep(6, { force: true });
  getSource()?.logEvent({ type: 'action', horodatage: Date.now(), message: `Configuration enregistrée (${machines.length} machines)`, auteur: 'Superviseur' });
}

/** « Simuler une panne » : injection dans la source temps réel, puis suivi automatique jusqu'à l'organe. */
export async function simulateFault(machineId?: string, organeNumero?: number) {
  const src = getSource();
  if (!src) return null;
  if (useUi.getState().step !== 6) await goToStep(6, { force: true });
  void switchView('3d');
  // Heure prise avant la demande : sur un réseau lent, l'alarme peut arriver par le temps réel avant la réponse.
  const debut = Date.now();
  let res: Awaited<ReturnType<typeof src.injectFault>>;
  try {
    res = await src.injectFault(machineId, organeNumero);
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Erreur inconnue';
    useLive.getState().pushToast({ gravite: 'critique', titre: 'Panne non simulée', texte: `${detail}. Réessayez quand la connexion est rétablie.` });
    return null;
  }
  if (!res) {
    useLive.getState().pushToast({ gravite: 'info', titre: 'Aucune machine disponible', texte: 'Toutes les machines en production sont déjà en défaut, ou le simulateur ne répond pas.' });
    return null;
  }
  useUi.getState().selectMachine(undefined);
  useUi.getState().setFocus({ kind: 'site' });
  followFault.current = { ...res, since: debut };
  // L'alarme est peut-être déjà là : la suivre tout de suite plutôt qu'attendre une alarme suivante.
  suivrePanne(useLive.getState().alarms);
  return res;
}

/** Panne à suivre : dès que l'alarme critique tombe, la caméra plonge jusqu'à l'organe. */
export const followFault: { current: { machineId: string; organeId: string; since: number } | null } = { current: null };

useLive.subscribe((s, prev) => {
  if (s.alarms !== prev.alarms) suivrePanne(s.alarms);
});

function suivrePanne(alarms: ReturnType<typeof useLive.getState>['alarms']) {
  const f = followFault.current;
  if (!f) return;
  const crit = alarms.find((a) => a.machineId === f.machineId && a.gravite === 'critique' && a.statut !== 'resolue' && a.horodatage >= f.since - 1000);
  if (!crit) return;
  followFault.current = null;
  const ui = useUi.getState();
  if (ui.step !== 6) return;
  ui.selectMachine(crit.machineId);
  // Laisse une seconde pour voir la machine passer au rouge sur le plan avant de plonger.
  window.setTimeout(() => {
    useUi.getState().setFocus({ kind: 'organe', machineId: crit.machineId, organeId: crit.organeId });
  }, isReducedMotion() ? 0 : 1100);
}

export function focusAlarm(alarmId: string) {
  const a = useLive.getState().alarms.find((x) => x.id === alarmId);
  if (!a) return;
  const ui = useUi.getState();
  const go = () => {
    void switchView('3d');
    ui.selectMachine(a.machineId);
    ui.setFocus({ kind: 'organe', machineId: a.machineId, organeId: a.organeId });
  };
  if (ui.step !== 6) void goToStep(6, { force: true }).then(() => window.setTimeout(go, 300));
  else go();
}
