/**
 * Le carnet de maintenance dit en phrases : à quel point chaque entretien presse, ce que dit sa barre, et la phrase
 * qui ouvre l'écran. Fonctions pures, calculées sur les échéances et les dérives d'analytics/maintenance.
 */
import { HORIZON_JOURS, type Echeance, type Prevision, type Prevue } from '@/analytics/maintenance';
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

const RANG_URGENCE: Record<Urgence, number> = { retard: 0, semaine: 1, 'plus-tard': 2 };

/** La plus pressante de plusieurs urgences (null : rien ne presse). */
export function plusPressante(...us: (Urgence | null)[]): Urgence | null {
  return us.reduce<Urgence | null>((pire, u) => (u && (!pire || RANG_URGENCE[u] < RANG_URGENCE[pire]) ? u : pire), null);
}

/** Minuit du jour de t, heure locale : une intervention prévue hier est en retard, même à 8 h ce matin. */
const jourDe = (t: number) => new Date(t).setHours(0, 0, 0, 0);

/** Rang d'une date future (dérive, intervention prévue) : passée, dans la semaine, dans le mois, ou au-delà. */
export function urgenceDate(t: number, now: number): Urgence | null {
  if (jourDe(t) < jourDe(now)) return 'retard';
  const j = joursJusqua(t, now);
  if (j <= 7) return 'semaine';
  return t - now <= HORIZON_JOURS * JOUR_MS ? 'plus-tard' : null;
}

/**
 * Une ligne de « À faire ». Le plus souvent une tâche du plan ; une mesure qui dérive sur son organe avance sa date, et
 * une intervention planifiée pour elle la range à son jour. Une dérive sans tâche au plan sur son organe, ou une
 * intervention planifiée qui ne réalise aucune tâche, font une ligne à elles seules.
 */
export interface LigneAFaire {
  /** Clé stable : celle de la tâche, sinon de l'intervention planifiée ou du point en dérive. */
  id: string;
  machineId: string;
  organeId?: string;
  organeNom: string;
  /** Ce qu'il faut faire : la tâche du plan, sinon l'intitulé de l'intervention planifiée ou de la dérive. */
  tache: string;
  /** Durée prévue (min), machine arrêtée. */
  duree: number;
  e?: Echeance;
  derive?: Prevision;
  prevue?: Prevue;
  /** Date qui range la ligne : l'intervention planifiée, sinon la plus proche de l'échéance et du seuil de la dérive. */
  date?: number;
  urgence: Urgence | null;
}

interface SourcesAFaire {
  ech: Echeance[];
  derives: Prevision[];
  prevues: Prevue[];
  now: number;
  /** Nom de l'organe d'une intervention planifiée qui ne passe pas par une tâche du plan. */
  nomOrgane?: (machineId: string, organeId?: string) => string;
}

/** Les lignes de « À faire », toutes urgences confondues (une tâche à jour au-delà du mois a une urgence nulle). */
export function lignesAFaire({ ech, derives, prevues, now, nomOrgane = () => '' }: SourcesAFaire): LigneAFaire[] {
  const deriveUtilisee = new Set<string>();
  const prevueUtilisee = new Set<string>();
  const lignes: LigneAFaire[] = ech.map((e) => {
    // Une dérive s'attache à la première tâche du plan sur le même organe : c'est elle qu'il faudra faire plus tôt.
    const derive = derives.find((d) => d.machineId === e.machineId && d.organeId === e.organeId && !deriveUtilisee.has(d.pointId));
    if (derive) deriveUtilisee.add(derive.pointId);
    const prevue = prevues.find((p) => p.machineId === e.machineId && p.tacheId === e.tacheId && !prevueUtilisee.has(p.id));
    if (prevue) prevueUtilisee.add(prevue.id);
    const dates = [e.echeance, derive?.franchissement].filter((t): t is number => t !== undefined);
    return {
      id: e.id,
      machineId: e.machineId,
      organeId: e.organeId,
      organeNom: e.organeNom,
      tache: e.tache,
      duree: prevue?.duree ?? e.duree,
      e,
      derive,
      prevue,
      date: prevue?.date ?? (dates.length ? Math.min(...dates) : undefined),
      urgence: plusPressante(urgence(e, now), derive ? urgenceDate(derive.franchissement, now) : null, prevue ? urgenceDate(prevue.date, now) : null),
    };
  });
  for (const d of derives) {
    if (deriveUtilisee.has(d.pointId)) continue;
    const prevue = prevues.find((p) => p.pointId === d.pointId && !p.tacheId && !prevueUtilisee.has(p.id));
    if (prevue) prevueUtilisee.add(prevue.id);
    lignes.push({
      id: `derive:${d.pointId}`,
      machineId: d.machineId,
      organeId: d.organeId,
      organeNom: d.organeNom,
      tache: prevue?.titre ?? `${d.libelle} en dérive`,
      duree: prevue?.duree ?? DUREE_SANS_PLAN,
      derive: d,
      prevue,
      date: prevue?.date ?? d.franchissement,
      urgence: plusPressante(urgenceDate(d.franchissement, now), prevue ? urgenceDate(prevue.date, now) : null),
    });
  }
  for (const p of prevues) {
    if (prevueUtilisee.has(p.id)) continue;
    lignes.push({
      id: p.id,
      machineId: p.machineId,
      organeId: p.organeId,
      organeNom: nomOrgane(p.machineId, p.organeId),
      tache: p.titre,
      duree: p.duree,
      prevue: p,
      date: p.date,
      urgence: urgenceDate(p.date, now),
    });
  }
  return lignes;
}

/** Durée proposée pour une intervention sur un organe sans tâche au plan (min). */
export const DUREE_SANS_PLAN = 30;

/** Une ligne sans date (usure sans tendance) se range comme si elle tombait aujourd'hui. */
const dateTri = (l: LigneAFaire, now: number) => l.date ?? now;

/** Lignes rangées par urgence, la plus pressante d'abord dans chaque rang. */
export function grouperParUrgence(lignes: LigneAFaire[], now: number): Record<Urgence, LigneAFaire[]> {
  const groupes: Record<Urgence, LigneAFaire[]> = { retard: [], semaine: [], 'plus-tard': [] };
  for (const l of lignes) if (l.urgence) groupes[l.urgence] = [...groupes[l.urgence], l];
  const tri = (a: LigneAFaire, b: LigneAFaire) => dateTri(a, now) - dateTri(b, now) || (b.e?.progression ?? 0) - (a.e?.progression ?? 0);
  return { retard: [...groupes.retard].sort(tri), semaine: [...groupes.semaine].sort(tri), 'plus-tard': [...groupes['plus-tard']].sort(tri) };
}

/** Temps d'arrêt machine d'une liste d'interventions (min). */
export const dureeTotale = (lignes: LigneAFaire[]) => lignes.reduce((s, l) => s + l.duree, 0);

/** Première lettre en minuscule, sauf pour un sigle (« UV… », « CTP… »). */
export function minuscule(s: string): string {
  if (s.length < 2 || s[1] !== s[1].toLowerCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => (n > 1 ? motPluriel : mot);
/** Espace insécable avant les deux-points : la phrase du haut, en gros, ne commence jamais une ligne par « : ». */
const DP = '\u00a0:';

/** Une date en mots, par rapport à maintenant : « dépassé de 11 jours », « aujourd'hui », « demain », « dans 3 jours ». */
export function quandDate(t: number, now: number): string {
  const j = joursJusqua(t, now);
  if (j < -1) return `dépassé de ${-j} jours`;
  if (j === -1) return 'dépassé d’un jour';
  if (j === 0) return 'aujourd’hui';
  if (j === 1) return 'demain';
  return `dans ${j} jours`;
}

/** Quand faire l'entretien, en mots : « dépassé de 11 jours », « demain », « dans 3 jours ». */
export function quand(e: Echeance, now: number): string {
  if (e.echeance === undefined) return e.statut === 'en_retard' ? 'limite atteinte' : 'pas de date prévue';
  return quandDate(e.echeance, now);
}

const jourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const heureMin = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Jour d'une intervention planifiée : « aujourd'hui à 13:00 », « demain à 13:00 », « jeu. 19 nov. à 13:00 ». */
export function jourPrevu(t: number, now: number): string {
  const j = Math.round((jourDe(t) - jourDe(now)) / JOUR_MS);
  const jour = j === 0 ? 'aujourd’hui' : j === 1 ? 'demain' : j === -1 ? 'hier' : jourCourt.format(t);
  return `${jour} à ${heureMin.format(t)}`;
}

/**
 * Quand, sur une ligne de « À faire » : la tâche en retard le reste ; une intervention planifiée dit son jour (et qu'il
 * reste à la consigner une fois le jour passé) ; une dérive qui avance la date dit quand la mesure franchira son seuil.
 */
export function quandLigne(l: LigneAFaire, now: number): string {
  if (l.prevue) return jourDe(l.prevue.date) < jourDe(now) ? `prévue ${jourPrevu(l.prevue.date, now)}, à consigner` : `prévue ${jourPrevu(l.prevue.date, now)}`;
  if (l.e && l.e.statut === 'en_retard') return quand(l.e, now);
  if (l.derive && (!l.e?.echeance || l.derive.franchissement < l.e.echeance)) return `seuil ${quandDate(l.derive.franchissement, now)}`;
  if (l.e) return l.urgence ? quand(l.e, now) : `à jour, ${quand(l.e, now)}`;
  return l.date !== undefined ? quandDate(l.date, now) : 'pas de date prévue';
}

/** Durée d'arrêt en mots courts : « 45 min », « 1 h 30 ». */
export function fmtArret(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
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
  groupes: Record<Urgence, LigneAFaire[]>;
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
  const de = (l: LigneAFaire) => (machine ? '' : ` de ${numero(l.machineId)}`);
  const prefixe = machine ? `Sur ${machine}, ` : '';
  const derive = previsions[0];
  const phraseDerives = derive
    ? previsions.length > 1
      ? `${previsions.length} mesures dérivent, dont ${phraseDerive(derive, numero(derive.machineId), !!machine)}.`
      : `Une mesure dérive${DP} ${phraseDerive(derive, numero(derive.machineId), !!machine)}.`
    : undefined;

  if (retard.length) {
    const premier = retard[0];
    const joursRetard = premier.date === undefined ? 0 : -joursJusqua(premier.date, now);
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
      verdict: capitale(`${prefixe}aucun entretien en retard, le prochain ${premier.date === undefined ? 'sans date' : quandDate(premier.date, now)}${DP} ${minuscule(premier.tache)}${de(premier)}.`),
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
