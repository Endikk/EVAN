/**
 * Les gestes de « À faire » : ouvrir le bon de travail prérempli, consigner en un geste une intervention planifiée,
 * l'annuler, la planifier. Chaque geste qui écrit dans le carnet laisse dix secondes pour revenir dessus (avis avec
 * « Annuler »).
 */
import type { Echeance, Prevision, Prevue } from '@/analytics/maintenance';
import type { Machine } from '@/domain/types';
import { useCarnet } from '@/store/carnet';
import { useLive } from '@/store/live';
import { useUi } from '@/store/ui';
import { getSource } from '@/realtime/source';
import { usePlanification, type CiblePlanification } from '@/widgets/intervention/planification';
import { DUREE_SANS_PLAN, fmtDateLongue, jourPrevu, minuscule, type LigneAFaire } from '../lib/carnet';

/**
 * Bon de travail prérempli depuis une ligne : la tâche du plan qu'elle réalise passe toujours, qu'elle se suive en
 * heures, en jours ou sur une mesure d'usure ; la consigner remet son compteur à zéro.
 */
export function consignerLigne(l: LigneAFaire) {
  useUi.getState().setSaisie({
    machineId: l.machineId,
    organeId: l.organeId,
    type: 'preventive',
    tacheId: l.e?.tacheId,
    titre: l.tache,
    duree: l.duree,
  });
}

/** Consigne une intervention planifiée telle que prévue, sans rouvrir de bon : l'avis dit ce qui a été noté. */
export function consignerPrevueFaite(p: Prevue, machine?: Machine) {
  const r = useCarnet.getState().consignerPrevue(p.id, Date.now());
  if (!r) return;
  const libelle = machine ? `${machine.numero} ${machine.nom}` : p.machineId;
  getSource()?.logIntervention(r.saisie, libelle);
  useLive.getState().pushToast({
    gravite: 'succes',
    titre: 'Intervention consignée',
    texte: `${machine?.numero ?? ''} · ${r.saisie.titre}${r.saisie.tacheId ? ' · compteur remis à zéro' : ''}`,
    action: {
      libelle: 'Annuler',
      faire: () => {
        useCarnet.getState().retirer(r.saisie.id);
        useCarnet.getState().planifier(r.prevue);
      },
    },
  });
}

/** Annule une intervention planifiée ; « Annuler » dans l'avis la remet à son jour. */
export function annulerPrevue(p: Prevue, machine?: Machine) {
  const retiree = useCarnet.getState().annulerPrevue(p.id);
  if (!retiree) return;
  useLive.getState().pushToast({
    gravite: 'info',
    titre: 'Intervention prévue annulée',
    texte: `${machine?.numero ?? ''} · ${retiree.titre}`,
    action: { libelle: 'Annuler', faire: () => useCarnet.getState().planifier(retiree) },
  });
}

/** Date limite d'une ligne, et pourquoi : le seuil de la dérive, sinon l'échéance de la tâche. */
function limite(e?: Echeance, d?: Prevision): CiblePlanification['limite'] {
  if (d && (!e?.echeance || d.franchissement < e.echeance)) {
    const seuil = d.niveau === 'alarme' ? 'seuil d’alarme' : 'seuil d’attention';
    return { date: d.franchissement, raison: `${d.libelle} atteindra son ${seuil} vers le ${fmtDateLongue(d.franchissement)}` };
  }
  if (e?.echeance !== undefined) return { date: e.echeance, raison: `L’échéance du plan tombe le ${fmtDateLongue(e.echeance)}` };
  return undefined;
}

/** Planifier une ligne de « À faire » (ou déplacer son intervention déjà planifiée). */
export function planifierLigne(l: LigneAFaire) {
  const p = l.prevue;
  usePlanification.getState().ouvrir({
    prevueId: p?.id,
    machineId: l.machineId,
    organeId: l.organeId,
    tacheId: p ? p.tacheId : l.e?.tacheId,
    titre: l.tache,
    duree: l.duree,
    date: p?.date,
    auteur: p?.auteur,
    pointId: p?.pointId ?? l.derive?.pointId,
    limite: limite(l.e, l.derive),
  });
}

/**
 * Planifier l'intervention qu'appelle une dérive : rattachée à la tâche du plan sur le même organe quand elle existe
 * (« Remplacer la lampe UV » pour la puissance UV qui baisse), sinon nommée d'après l'organe.
 */
export function planifierDerive(d: Prevision, tache?: Echeance, prevue?: Prevue) {
  usePlanification.getState().ouvrir({
    prevueId: prevue?.id,
    machineId: d.machineId,
    organeId: d.organeId,
    tacheId: prevue ? prevue.tacheId : tache?.tacheId,
    titre: prevue?.titre ?? tache?.tache ?? `Intervenir sur ${minuscule(d.organeNom)} : ${minuscule(d.libelle)} en dérive`,
    duree: prevue?.duree ?? tache?.duree ?? DUREE_SANS_PLAN,
    date: prevue?.date,
    auteur: prevue?.auteur,
    pointId: d.pointId,
    limite: limite(undefined, d),
  });
}

/** Ce que dit le pied d'une ligne planifiée, pour les lecteurs d'écran et les avis. */
export const direPrevue = (p: Prevue, now: number) => `prévue ${jourPrevu(p.date, now)}`;
