/**
 * Planifier une intervention, ou déplacer une intervention déjà planifiée : ce que la fenêtre de planification doit
 * savoir pour s'ouvrir préremplie. Elle s'ouvre depuis une dérive (« Planifier l'intervention »), depuis le détail
 * d'un entretien du plan, ou depuis une intervention planifiée (« Déplacer »).
 */
import { create } from 'zustand';
import { lireDuree } from './duree';

const DUREE_MAX_MIN = 24 * 60;
/** Heure proposée : 13 h, à la relève entre l'équipe du matin et celle de l'après-midi. Elle reste modifiable. */
const HEURE_OUVREE = 13;

export interface CiblePlanification {
  /** Intervention planifiée à déplacer ; absente pour en planifier une nouvelle. */
  prevueId?: string;
  machineId: string;
  organeId?: string;
  /** Tâche du plan qu'elle réalisera (même organe). */
  tacheId?: string;
  titre: string;
  /** Durée proposée (min). */
  duree: number;
  /** Date déjà retenue (déplacement). */
  date?: number;
  auteur?: string;
  /** Point de mesure en dérive à l'origine. */
  pointId?: string;
  /** Date avant laquelle intervenir (seuil de la dérive, échéance de la tâche), et pourquoi, en quelques mots. */
  limite?: { date: number; raison: string };
}

interface PlanificationState {
  cible: CiblePlanification | null;
  ouvrir(c: CiblePlanification): void;
  fermer(): void;
}

export const usePlanification = create<PlanificationState>()((set) => ({
  cible: null,
  ouvrir: (cible) => set({ cible }),
  fermer: () => set({ cible: null }),
}));

/**
 * Date proposée : le prochain jour ouvré à 13 h (entre les deux équipes, jamais le dimanche), ramenée avant la date
 * limite quand elle tombe plus tôt, et jamais dans le passé.
 */
export function dateProposee(now: number, limite?: number): number {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(HEURE_OUVREE, 0, 0, 0);
  if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  let t = d.getTime();
  if (limite !== undefined && t > limite) t = Math.max(limite - 2 * 3_600_000, now + 3_600_000);
  return Math.ceil(t / 60_000) * 60_000;
}

/** Contrôle avant d'enregistrer, dans l'ordre des champs : chaque message dit quoi corriger. */
export function verifierPlanification(v: { date: string; duree: string }, now: number): Partial<Record<'date' | 'duree', string>> {
  const e: Partial<Record<'date' | 'duree', string>> = {};
  const t = new Date(v.date).getTime();
  if (!v.date || Number.isNaN(t)) e.date = 'Choisissez le jour et l’heure de l’intervention.';
  else if (t <= now) e.date = 'Cette date est passée : choisissez une date à venir. Ce qui est déjà fait se consigne.';
  const d = lireDuree(v.duree);
  if (d === null) e.duree = 'En minutes ou en heures, par exemple 45 min ou 1 h 30.';
  else if (d < 1) e.duree = 'Indiquez au moins 1 minute.';
  else if (d > DUREE_MAX_MIN) e.duree = 'Une intervention dure au plus 24 h.';
  return e;
}
