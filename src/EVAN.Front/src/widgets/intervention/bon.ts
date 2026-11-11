/**
 * Contrôle du bon de travail, sans React : ce qui est vérifié avant d'enregistrer une intervention, dans l'ordre des
 * champs du formulaire, et le début proposé. Testé dans bon.test.ts.
 */
import { fmtNombre } from '@/ui/format';
import { lireDuree } from './duree';

export const DUREE_MAX_MIN = 24 * 60;
export const DUREE_DEFAUT = 30;
export const TITRE_MIN = 3;
/** Petite tolérance sur l'heure saisie, pour une horloge de poste un peu en avance. */
const AVANCE_TOLEREE_MS = 5 * 60_000;

export type Champ = 'machine' | 'titre' | 'date' | 'duree';
export type Erreurs = Partial<Record<Champ, string>>;

/** Les champs dans l'ordre du formulaire : le résumé des erreurs et le focus suivent cet ordre. */
export const ORDRE: Champ[] = ['machine', 'titre', 'date', 'duree'];
export const NOM_CHAMP: Record<Champ, string> = { machine: 'machine', titre: 'ce qui a été fait', date: 'début', duree: 'durée' };

export interface Valeurs {
  machineId: string;
  titre: string;
  duree: string;
  date: string;
}

/** Début proposé : maintenant moins la durée, pour qu'une intervention qu'on vient de finir ne finisse pas dans le futur. */
export const debutPropose = (now: number, dureeMin: number) => Math.floor((now - dureeMin * 60_000) / 60_000) * 60_000;

/** Contrôle du bon avant enregistrement, dans l'ordre du formulaire : chaque message dit quoi corriger. */
export function verifier(v: Valeurs, machineExiste: boolean, now: number): Erreurs {
  const e: Erreurs = {};
  if (!v.machineId || !machineExiste) e.machine = 'Choisissez la machine sur laquelle vous êtes intervenu.';
  const titre = v.titre.trim();
  if (!titre) e.titre = 'Écrivez en quelques mots ce qui a été fait.';
  else if (titre.length < TITRE_MIN) e.titre = `L’intitulé est trop court : au moins ${TITRE_MIN} caractères.`;
  const d = lireDuree(v.duree);
  const t = new Date(v.date).getTime();
  if (!v.date || Number.isNaN(t)) e.date = 'Indiquez la date et l’heure du début de l’intervention.';
  else if (t > now + AVANCE_TOLEREE_MS) e.date = 'Cette date est dans le futur : on consigne ce qui a déjà été fait. Pour plus tard, planifiez l’intervention.';
  else if (d && t + d * 60_000 > now + AVANCE_TOLEREE_MS) e.date = 'Avec cette durée, l’intervention finirait plus tard que maintenant : avancez l’heure de début.';
  if (d === null) e.duree = 'En minutes ou en heures, par exemple 45 min ou 1 h 30.';
  else if (d < 1) e.duree = 'Indiquez au moins 1 minute.';
  else if (d > DUREE_MAX_MIN) e.duree = `Une intervention dure au plus 24 h (${fmtNombre(DUREE_MAX_MIN)} min). Au-delà, consignez-en une par jour.`;
  // Rangées dans l'ordre du formulaire, quel que soit l'ordre des contrôles ci-dessus.
  const ordonnees: Erreurs = {};
  for (const c of ORDRE) if (e[c]) ordonnees[c] = e[c];
  return ordonnees;
}
