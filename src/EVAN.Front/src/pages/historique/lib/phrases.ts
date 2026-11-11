/**
 * Les phrases de l'historique, calculées à partir des chiffres de l'écran : le verdict en tête, puis une leçon sous
 * chaque graphique. Une leçon tient sur une ligne (90 caractères au plus) et ne répète ni le verdict ni le titre : la
 * façon de lire le graphique est dans son « ? ». Une phrase qui n'a rien à dire (aucune donnée) le dit, plutôt que
 * d'afficher un zéro trompeur.
 *
 * Les espaces insécables (\u00a0) gardent ensemble un nombre et son unité : « 73 % » ne se coupe jamais en fin de ligne.
 */
import type { Ton } from '@/ui/explain';
// Le module seul, sans les composants du kit : ces phrases se testent sans navigateur.
import { lireEfficacite } from '@/ui/explain/lecture';
import { H } from '@/sim/history';
import type { Bilan, LigneMachine, LigneOrgane, Periode, PanneRecurrente, JourTrs } from './calculs';

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** « 15,8 h » */
export const heures = (ms: number) => `${nf1.format(ms / H)}\u00a0h`;
/** « 73 % » */
export const pourcent = (v: number) => `${Math.round(v * 100)}\u00a0%`;
/** « mer. 4 » : le jour sous une colonne ou un point de courbe, assez court pour que sept jours tiennent côte à côte. */
const jourAxe = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
export const fmtJourAxe = (t: number) => jourAxe.format(t);
/** « 3,2 % » sous 10 %, où l'arrondi à l'unité écraserait les écarts ; « 73 % » au-delà. */
export const pourcentFin = (v: number) => (v < 0.1 ? `${nf1.format(v * 100)}\u00a0%` : pourcent(v));

/** Une durée dite avec des mots : « 9 minutes », « 1 heure et 5 minutes », « moins d’une minute ». */
export function dureeEnMots(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'moins d’une minute';
  if (min < 60) return min === 1 ? '1\u00a0minute' : `${min}\u00a0minutes`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  const hs = h === 1 ? '1\u00a0heure' : `${h}\u00a0heures`;
  if (!r) return hs;
  return `${hs} et ${r === 1 ? '1\u00a0minute' : `${r}\u00a0minutes`}`;
}

/**
 * La même durée en chiffres, pour une colonne : « 9 min », « 1 h 05 », « < 1 min ». Arrondie comme dureeEnMots,
 * pour que la ligne du journal et sa phrase complète (volet, lecteur d'écran) disent la même chose.
 */
export function dureeCourte(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 1) return '<\u00a01\u00a0min';
  if (min < 60) return `${min}\u00a0min`;
  const r = min % 60;
  return r ? `${Math.floor(min / 60)}\u00a0h\u00a0${String(r).padStart(2, '0')}` : `${Math.floor(min / 60)}\u00a0h`;
}

/** Met l'initiale en minuscule en milieu de phrase, sauf pour un sigle (« Séchage UV » → « séchage UV », « RFID » reste). */
export function minusculeInitiale(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** « Sur 7 jours » ou « Sur les dernières 24 heures ». */
export const surLaPeriode = (p: Periode) => (p === '24h' ? 'Sur les dernières 24\u00a0heures' : 'Sur 7\u00a0jours');
/** La même chose en fin de phrase : « sur 7 jours ». */
export const periodeEnFin = (p: Periode) => (p === '24h' ? 'sur les dernières 24\u00a0heures' : 'sur 7\u00a0jours');

/** Part du temps d'ouverture perdue en pannes : en dessous de 3 %, c'est peu ; au-delà de 8 %, c'est beaucoup. */
export function niveauPannes(part: number): { ton: Ton; mot: string } {
  if (part < 0.03) return { ton: 'ok', mot: 'Faible' };
  if (part < 0.08) return { ton: 'warn', mot: 'À surveiller' };
  return { ton: 'crit', mot: 'Élevé' };
}

const cause = (l: { panne: number; calage: number }) => (l.calage >= l.panne ? 'pour des réglages' : 'en panne');

/** Durée moyenne d'un réglage, absente s'il n'y en a pas eu. */
export const reglageMoyen = (b: { calage: number; nCalages: number }) => (b.nCalages ? b.calage / b.nCalages : undefined);

/**
 * Pourquoi les réglages pèsent : combien, et combien de temps chacun, face à la moyenne de l'atelier. Sans le nombre,
 * « 14 h de réglages » ne dit pas s'il faut en faire moins ou les faire plus vite.
 * « 31 réglages de 27 minutes en moyenne (atelier : 22 minutes) »
 */
export function detailReglages(b: { calage: number; nCalages: number }, atelier?: { calage: number; nCalages: number }): string | undefined {
  const moyen = reglageMoyen(b);
  if (moyen === undefined) return undefined;
  const ref = atelier && atelier !== b ? reglageMoyen(atelier) : undefined;
  const nombre = b.nCalages === 1 ? '1 réglage' : `${b.nCalages} réglages`;
  // L'atelier n'est cité que si l'écart dit quelque chose : à une minute près, la comparaison serait du bruit.
  const ecartNet = ref !== undefined && Math.abs(moyen - ref) >= 0.1 * ref && Math.round(ref / 60_000) !== Math.round(moyen / 60_000);
  const comparaison = ecartNet ? ` (atelier : ${dureeEnMots(ref)})` : '';
  return `${nombre} de ${dureeEnMots(moyen)} en moyenne${comparaison}`;
}

export interface Verdict {
  verdict: string;
  suite?: string;
  ton: Ton;
}

/**
 * La phrase du haut. Elle rappelle toujours la période, et la machine quand l'écran est filtré sur une seule :
 * « Sur 7 jours, les machines ont produit 73 % du temps possible. » puis « R07 s’arrête le plus : 15,8 h, surtout
 * pour des réglages, 31 réglages de 27 minutes en moyenne. » C'est elle qui nomme la machine la plus arrêtée : la
 * leçon du graphique des arrêts ne le redit pas.
 *
 * Quand les réglages l'emportent, la suite dit combien et combien de temps chacun, face à `atelier` (toutes les
 * machines) : c'est là qu'est la leçon. L'organe le plus touché par les pannes n'est nommé que si les pannes
 * l'emportent.
 */
export function verdictHistorique(periode: Periode, b: Bilan, machine?: { numero: string; creeLe?: number }, organe?: string, atelier?: Bilan): Verdict {
  const sur = surLaPeriode(periode);
  if (machine?.creeLe) return { verdict: `${machine.numero} vient d’être ajoutée : elle n’a pas encore d’historique.`, ton: 'neutre' };
  if (!b.lignes.length) return { verdict: 'Pas encore d’historique : les machines ajoutées récemment n’ont pas de passé à montrer.', ton: 'neutre' };
  const sujet = machine ? machine.numero : 'les machines';
  if (b.trs === undefined) {
    return {
      verdict: `${sur}, ${sujet} n’${machine ? 'a' : 'ont'} pas tourné : rien à mesurer.`,
      suite: periode === '24h' ? 'Passez sur 7 jours pour voir toute la semaine.' : undefined,
      ton: 'neutre',
    };
  }
  const verdict = `${sur}, ${sujet} ${machine ? 'a' : 'ont'} produit ${pourcent(b.trs)} du temps possible.`;
  // Même lecture de l'efficacité que sur les autres écrans (kit) : une efficacité basse n'est jamais « crit ».
  const ton = lireEfficacite(b.trs).ton;
  if (machine) {
    const total = b.panne + b.calage;
    if (!total) return { verdict, suite: 'Elle ne s’est arrêtée ni pour une panne ni pour un réglage.', ton };
    const reglages = b.calage >= b.panne ? detailReglages(b, atelier) : undefined;
    if (reglages) {
      const quoi = b.panne ? 'surtout des réglages' : 'que des réglages';
      return { verdict, suite: `${heures(total)} d’arrêt, ${quoi} : ${reglages}.`, ton };
    }
    const detail = !b.panne
      ? `${heures(total)} d’arrêt, que des réglages.`
      : !b.calage
        ? `${heures(total)} d’arrêt, que des pannes.`
        : `${heures(total)} d’arrêt, dont ${heures(b.panne)} de pannes.`;
    return { verdict, suite: organe && b.panne > b.calage ? `${detail} Organe le plus touché : ${organe}.` : detail, ton };
  }
  const pire = [...b.lignes].sort((x, y) => y.panne + y.calage - (x.panne + x.calage))[0];
  if (!pire || pire.panne + pire.calage === 0) return { verdict, suite: 'Aucun arrêt sur la période.', ton };
  const debut = `${pire.m.numero} s’arrête le plus : ${heures(pire.panne + pire.calage)}, surtout ${cause(pire)}`;
  const reglages = pire.calage >= pire.panne ? detailReglages(pire, b) : undefined;
  return { verdict, suite: reglages ? `${debut}, ${reglages}.` : `${debut}.`, ton };
}

/**
 * Leçon du graphique « Temps d’arrêt par machine » : le poids des réglages face aux pannes. La machine la plus
 * arrêtée est déjà dans le verdict, et en tête du graphique.
 */
export function leconArrets(lignes: LigneMachine[], selection?: LigneMachine): string {
  if (selection) {
    const total = selection.panne + selection.calage;
    if (!total) return `${selection.m.numero} ne s’est pas arrêtée sur la période.`;
    if (!selection.panne) return `Pour ${selection.m.numero}, tous les arrêts sont des réglages.`;
    if (!selection.calage) return `Pour ${selection.m.numero}, tous les arrêts sont des pannes.`;
    return `Pour ${selection.m.numero}, ${pourcent(selection.calage / total)} des arrêts sont des réglages.`;
  }
  const panne = lignes.reduce((s, l) => s + l.panne, 0);
  const calage = lignes.reduce((s, l) => s + l.calage, 0);
  if (!panne && !calage) return 'Aucun arrêt sur la période.';
  if (!panne) return 'Aucune panne : tous les arrêts sont des réglages.';
  const rapport = calage / panne;
  if (rapport >= 1.5) return `Les réglages prennent ${Math.round(rapport)} fois plus de temps que les pannes.`;
  if (rapport <= 1 / 1.5) return 'Les pannes prennent plus de temps que les réglages.';
  return 'Réglages et pannes pèsent à peu près autant.';
}

/**
 * Leçon de la carte des arrêts : la machine la plus touchée. Ses heures sont écrites sous elle et au bout de la
 * légende ; la lecture des teintes est dans le « ? ».
 */
export function leconCarte(lignes: LigneMachine[]): string {
  const pire = [...lignes].sort((a, b) => b.panne - a.panne)[0];
  if (!pire || !pire.panne) return 'Aucune panne sur la période : toutes les machines restent grises.';
  return `La plus touchée : ${pire.m.numero}.`;
}

/** Leçon des pannes par organe. */
export function leconOrganes(organes: LigneOrgane[], totalPanne: number): string {
  const top = organes[0];
  if (!top) return 'Aucune panne sur la période.';
  const nom = minusculeInitiale(top.nom.replace(/^\d+\.\s*/, ''));
  const ou = top.type ? `${nom} (${minusculeInitiale(top.type)})` : nom;
  const part = totalPanne ? top.ms / totalPanne : 0;
  const poids = part >= 0.3 ? `, ${pourcent(part)} des pannes` : '';
  return `Le plus touché : ${ou}, ${heures(top.ms)}${poids}.`;
}

/**
 * Leçon de la courbe : tenue de la plage normale pendant la production (la machine est nommée juste au-dessus de la
 * courbe), alarmes levées sur la mesure.
 */
export function leconCourbe(part: number | undefined, nAlarmes: number): string {
  if (part === undefined) {
    return nAlarmes === 0 ? 'Aucune alarme sur cette mesure.' : nAlarmes === 1 ? 'Une alarme levée sur cette mesure.' : `${nAlarmes} alarmes levées sur cette mesure.`;
  }
  const alarmes = nAlarmes === 0 ? 'Aucune alarme.' : nAlarmes === 1 ? 'Une alarme levée.' : `${nAlarmes} alarmes levées.`;
  if (part >= 0.995 && nAlarmes > 0) {
    return `Toujours dans la plage normale en production, hors ${nAlarmes === 1 ? 'l’alarme levée' : `les ${nAlarmes} alarmes levées`}.`;
  }
  if (part >= 0.995) return `Toujours dans la plage normale en production. ${alarmes}`;
  return `Dans la plage normale ${pourcent(part)} du temps de production. ${alarmes}`;
}

/** Leçon de l'efficacité machine par machine. */
export function leconEfficaciteMachines(lignes: LigneMachine[], selectionId?: string): string {
  const ouvertes = lignes.filter((l) => l.trs !== undefined).sort((a, b) => b.trs! - a.trs!);
  if (!ouvertes.length) return 'Aucune machine n’a tourné sur la période.';
  const sel = ouvertes.findIndex((l) => l.m.id === selectionId);
  if (sel >= 0) {
    const l = ouvertes[sel];
    return `${l.m.numero} : ${pourcent(l.trs!)}, ${sel === 0 ? 'la meilleure' : sel === ouvertes.length - 1 ? 'la moins bonne' : `${sel + 1}e sur ${ouvertes.length}`} de l’atelier.`;
  }
  const best = ouvertes[0];
  const worst = ouvertes[ouvertes.length - 1];
  if (best === worst) return `${best.m.numero} : ${pourcent(best.trs!)}.`;
  return `${best.m.numero} fait le mieux (${pourcent(best.trs!)}), ${worst.m.numero} le moins bien (${pourcent(worst.trs!)}).`;
}

const PERTE: Record<'D' | 'P' | 'Q', string> = {
  D: 'les arrêts',
  P: 'la lenteur',
  Q: 'les étiquettes jetées',
};

/** Leçon de l'efficacité jour par jour : la perte qui pèse le plus (les jours eux-mêmes se lisent sur la courbe). */
export function leconJours(jours: JourTrs[]): string {
  if (jours.length < 2) return 'Un seul jour sur la période : passez sur 7 jours pour voir l’évolution.';
  const moy = (k: 'D' | 'P' | 'Q') => jours.reduce((s, j) => s + j[k], 0) / jours.length;
  const pire = (['D', 'P', 'Q'] as const).reduce((a, k) => (moy(k) < moy(a) ? k : a));
  return `Ce qui coûte le plus : ${PERTE[pire]}.`;
}

/**
 * Leçon des alarmes critiques par colonne : le jour le plus chargé, ou sur 24 heures la tranche de 4 heures la plus
 * chargée (le total est dans la rangée des chiffres, en haut). `nommer` dit la colonne : « mar. 10 nov. », « de 16:00
 * à 20:00 ».
 */
export function leconAlarmesJour<T extends { t: number; v: number }>(jours: T[], nommer: (j: T) => string, parTranche = false): string {
  const total = jours.reduce((s, j) => s + j.v, 0);
  if (!total) return 'Aucune alarme critique sur la période.';
  const pic = jours.reduce((a, b) => (b.v > a.v ? b : a));
  // La date courte finit par un point (« 14 oct. ») : elle ne termine pas la phrase.
  return `${parTranche ? 'Tranche la plus chargée' : 'Jour le plus chargé'} : ${nommer(pic)}, ${pic.v} alarme${pic.v > 1 ? 's' : ''}.`;
}

/** Leçon des pannes qui reviennent. */
export function leconRecurrentes(top: PanneRecurrente | undefined, parDuree: boolean): string {
  if (!top) return 'Aucune panne n’est revenue sur la période.';
  const quoi = `« ${top.message} » sur ${top.numero}`;
  if (parDuree) return `${quoi} coûte le plus : ${heures(top.ms)} en ${top.n} fois.`;
  return `${quoi} revient le plus : ${top.n} fois.`;
}
