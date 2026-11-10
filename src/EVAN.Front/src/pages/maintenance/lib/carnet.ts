/**
 * Le carnet de maintenance dit en phrases : à quel point chaque entretien presse, ce que dit sa barre, et la phrase
 * qui ouvre l'écran. Fonctions pures, calculées sur les échéances et les dérives d'analytics/maintenance.
 */
import { HORIZON_JOURS, type Echeance, type Prevision } from '@/analytics/maintenance';
import type { Ton } from '@/ui/explain';
import { fmtNombre, fmtValue } from '@/ui/format';

const JOUR_MS = 86_400_000;
/** Au-delà d'une semaine de retard, l'entretien oublié devient le problème de l'écran. */
const RETARD_GRAVE_JOURS = 7;

/** Les trois rangs de la liste « À faire » : déjà en retard, à faire dans les sept jours, plus loin. */
export type Urgence = 'retard' | 'semaine' | 'plus-tard';

export const URGENCE_TITRE: Record<Urgence, string> = {
  retard: 'En retard',
  semaine: 'Cette semaine',
  'plus-tard': 'Plus tard',
};

/** Jours entiers entre maintenant et t : négatif quand t est passé. */
export const joursJusqua = (t: number, now: number) => Math.round((t - now) / JOUR_MS);

/**
 * Rang d'une échéance dans la liste. Une tâche à jour n'entre dans « Plus tard » que si elle tombe dans l'horizon
 * des prévisions (30 jours) : au-delà, elle ne demande rien à personne.
 */
export function urgence(e: Echeance, now: number): Urgence | null {
  if (e.statut === 'en_retard') return 'retard';
  // Compté en jours entiers, comme la ligne l'affiche : « dans 7 jours » reste dans la semaine.
  const proche = e.echeance !== undefined && joursJusqua(e.echeance, now) <= 7;
  if (e.statut === 'a_planifier') return proche ? 'semaine' : 'plus-tard';
  if (e.echeance !== undefined && e.echeance - now <= HORIZON_JOURS * JOUR_MS) return proche ? 'semaine' : 'plus-tard';
  return null;
}

/** Une tâche sans date (usure sans tendance) se range comme si elle tombait aujourd'hui. */
const dateTri = (e: Echeance, now: number) => e.echeance ?? now;

/** Échéances rangées par urgence, la plus pressante d'abord dans chaque rang. */
export function grouperParUrgence(ech: Echeance[], now: number): Record<Urgence, Echeance[]> {
  const groupes: Record<Urgence, Echeance[]> = { retard: [], semaine: [], 'plus-tard': [] };
  for (const e of ech) {
    const u = urgence(e, now);
    if (u) groupes[u] = [...groupes[u], e];
  }
  const tri = (a: Echeance, b: Echeance) => dateTri(a, now) - dateTri(b, now) || b.progression - a.progression;
  return { retard: [...groupes.retard].sort(tri), semaine: [...groupes.semaine].sort(tri), 'plus-tard': [...groupes['plus-tard']].sort(tri) };
}

/** Première lettre en minuscule, sauf pour un sigle (« UV… », « CTP… »). */
export function minuscule(s: string): string {
  if (s.length < 2 || s[1] !== s[1].toLowerCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => (n > 1 ? motPluriel : mot);
/** Espace insécable avant les deux-points : la phrase du haut, en gros, ne commence jamais une ligne par « : ». */
const DP = '\u00a0:';

/** Quand faire l'entretien, en mots : « dépassé de 11 jours », « demain », « dans 3 jours ». */
export function quand(e: Echeance, now: number): string {
  if (e.echeance === undefined) return e.statut === 'en_retard' ? 'limite atteinte' : 'pas de date prévue';
  const j = joursJusqua(e.echeance, now);
  if (j < -1) return `dépassé de ${-j} jours`;
  if (j === -1) return 'dépassé d’un jour';
  if (j === 0) return 'aujourd’hui';
  if (j === 1) return 'demain';
  return `dans ${j} jours`;
}

/** Ton de l'échéance : la forme et le mot accompagnent toujours la couleur. */
export function tonEcheance(u: Urgence | null): Ton {
  return u === 'retard' ? 'crit' : u === 'semaine' ? 'warn' : 'neutre';
}

/** Ce que mesure la barre d'une tâche, sans sigle : « 1 623 h de marche sur 1 500 h prévues ». */
export function texteCompteur(e: Echeance): string {
  if (e.nature === 'conditionnelle') return `Mesure : ${fmtValue(e.compteur, e.unite)}, limite à ${fmtValue(e.seuil, e.unite)}`;
  if (e.unite === 'j') {
    const j = Math.round(e.compteur);
    return `${fmtNombre(j)} ${pluriel(j, 'jour')} sur ${fmtNombre(e.seuil)} prévus`;
  }
  return `${fmtNombre(e.compteur)} h de marche sur ${fmtNombre(e.seuil)} h prévues`;
}

/** Rythme d'une tâche du plan : « toutes les 1 500 h de marche », « tous les 90 jours ». */
export function rythme(e: Echeance): string {
  if (e.nature === 'conditionnelle') return `dès que la mesure atteint ${fmtValue(e.seuil, e.unite)}`;
  return e.unite === 'j' ? `tous les ${fmtNombre(e.seuil)} jours` : `toutes les ${fmtNombre(e.seuil)} h de marche`;
}

export interface Verdict {
  verdict: string;
  ton: Ton;
  suite?: string;
}

interface EntreeVerdict {
  groupes: Record<Urgence, Echeance[]>;
  previsions: Prevision[];
  /** Numéro de machine (« R01 ») d'après son identifiant. */
  numero: (machineId: string) => string;
  now: number;
  /** Numéro de la machine filtrée : la phrase parle d'elle seule. */
  machine?: string;
}

const dateLongue = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
export const fmtDateLongue = (t: number) => dateLongue.format(t);
const jourHeure = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
/** « mardi 13 octobre à 14:20 », première lettre en capitale. */
export const fmtJourHeure = (t: number) => capitale(jourHeure.format(t));

/** Une dérive nommée en quelques mots : « puissance UV de R04 ». Sa date est dans la carte de la prévision. */
function phraseDerive(p: Prevision, numero: string, seule: boolean): string {
  return `${minuscule(p.libelle)}${seule ? '' : ` de ${numero}`}`;
}

/**
 * La phrase qui ouvre l'écran, en une seule phrase : y a-t-il des entretiens en retard, et lequel faire en premier ?
 * Son retard en jours est sur la première ligne de « À faire », juste dessous, et le nombre de la semaine dans le
 * premier repère ; la suite ne parle que d'une dérive. Le ton suit le retard : plus d'une semaine de retard sur le
 * plus urgent, c'est un problème (carré) ; moins, c'est à surveiller (triangle).
 */
export function verdictMaintenance({ groupes, previsions, numero, now, machine }: EntreeVerdict): Verdict {
  const retard = groupes.retard;
  const semaine = groupes.semaine;
  const de = (e: Echeance) => (machine ? '' : ` de ${numero(e.machineId)}`);
  const prefixe = machine ? `Sur ${machine}, ` : '';
  const derive = previsions[0];
  const phraseDerives = derive
    ? previsions.length > 1
      ? `${previsions.length} mesures dérivent, dont ${phraseDerive(derive, numero(derive.machineId), !!machine)}.`
      : `Une mesure dérive${DP} ${phraseDerive(derive, numero(derive.machineId), !!machine)}.`
    : undefined;

  if (retard.length) {
    const premier = retard[0];
    const joursRetard = premier.echeance === undefined ? 0 : -joursJusqua(premier.echeance, now);
    const tete =
      retard.length > 1
        ? `${prefixe}${retard.length} entretiens en retard, à commencer par ${minuscule(premier.tache)}${de(premier)}.`
        : `${prefixe}1 entretien en retard${DP} ${minuscule(premier.tache)}${de(premier)}.`;
    return {
      verdict: capitale(tete),
      ton: joursRetard >= RETARD_GRAVE_JOURS ? 'crit' : 'warn',
      suite: phraseDerives,
    };
  }
  if (semaine.length) {
    const premier = semaine[0];
    return {
      verdict: capitale(`${prefixe}aucun entretien en retard, le prochain ${quand(premier, now)}${DP} ${minuscule(premier.tache)}${de(premier)}.`),
      ton: derive ? 'warn' : 'ok',
      suite: phraseDerives,
    };
  }
  return {
    verdict: capitale(`${prefixe}tous les entretiens sont à jour.`),
    ton: derive ? 'warn' : 'ok',
    suite: phraseDerives ?? 'Rien n’est prévu dans les sept prochains jours.',
  };
}

const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
