/**
 * L'atelier en direct dit avec des mots : combien de machines produisent, laquelle est en panne et où, si
 * l'efficacité du moment est dans ses habitudes. Fonctions pures, calculées à partir de l'état temps réel,
 * pour la phrase du bandeau, le panneau et les fiches.
 */
import type { Alarme, EtatMachine, Machine } from '@/domain/types';
import type { MachineLive } from '@/store/live';
import { fmtDuration } from '@/ui/format';

export type Ton = 'ok' | 'warn' | 'crit' | 'neutre';

/** L'état d'une machine en clair (le calage devient un réglage, le mot du métier reste entre parenthèses). */
export const ETAT_MOT: Record<EtatMachine, string> = {
  marche: 'En marche',
  attention: 'À surveiller',
  panne: 'En panne',
  calage: 'En réglage (calage)',
  arret: 'À l’arrêt',
};

/** Le même état, en minuscules, pour l'insérer dans une phrase. */
export const ETAT_DANS_PHRASE: Record<EtatMachine, string> = {
  marche: 'en marche',
  attention: 'à surveiller',
  panne: 'en panne',
  calage: 'en réglage (calage)',
  arret: 'à l’arrêt',
};

export const MOT_HORS_LIGNE = 'Liaison perdue';

/** Ordre de lecture : d'abord ce qui produit, puis ce qui ne produit pas, la panne en dernier pour finir l'œil dessus. */
const ORDRE_BANDE: EtatMachine[] = ['marche', 'attention', 'calage', 'arret', 'panne'];

export interface MachineEtat {
  machine: Machine;
  /** État affiché : une machine sans nouvelles est montrée éteinte. */
  etat: EtatMachine;
  horsLigne: boolean;
  depuis?: number;
}

export interface EtatAtelier {
  total: number;
  /** Machines dont on reçoit les données. */
  suivies: number;
  /** En marche ou à surveiller : elles sortent des étiquettes. */
  produisent: number;
  parEtat: Record<EtatMachine, Machine[]>;
  horsLigne: Machine[];
  /** Une entrée par machine, dans l'ordre de la bande du bandeau. */
  bande: MachineEtat[];
}

export function etatAtelier(machines: Machine[], live: Record<string, MachineLive | undefined>): EtatAtelier {
  const parEtat: Record<EtatMachine, Machine[]> = { marche: [], attention: [], panne: [], calage: [], arret: [] };
  const horsLigne: Machine[] = [];
  const bande: MachineEtat[] = [];
  let suivies = 0;
  for (const m of machines) {
    const l = live[m.id];
    if (!l) continue;
    if (l.horsLigne) {
      horsLigne.push(m);
      bande.push({ machine: m, etat: 'arret', horsLigne: true, depuis: l.depuis });
      continue;
    }
    suivies++;
    parEtat[l.etat].push(m);
    bande.push({ machine: m, etat: l.etat, horsLigne: false, depuis: l.depuis });
  }
  bande.sort((a, b) => rangBande(a) - rangBande(b));
  return { total: machines.length, suivies, produisent: parEtat.marche.length + parEtat.attention.length, parEtat, horsLigne, bande };
}

function rangBande(e: MachineEtat) {
  return e.horsLigne ? ORDRE_BANDE.length : ORDRE_BANDE.indexOf(e.etat);
}

/** Rang d'urgence : panne non prise en charge, panne prise en charge, puis les points à surveiller. */
function rangUrgence(a: Alarme) {
  const gravite = a.gravite === 'critique' ? 0 : a.gravite === 'attention' ? 2 : 4;
  return gravite + (a.statut === 'active' ? 0 : 1);
}

/** Alarmes non résolues, la plus urgente d'abord ; à urgence égale, celle qui attend depuis le plus longtemps. */
export function parUrgence(alarms: Alarme[]): Alarme[] {
  return alarms.filter((a) => a.statut !== 'resolue').sort((a, b) => rangUrgence(a) - rangUrgence(b) || a.horodatage - b.horodatage);
}

/** Met en minuscule l'initiale d'un nom d'organe pour l'écrire dans une phrase, sans toucher aux sigles (« UV »). */
export function minusculeInitiale(s: string): string {
  if (s.length < 2 || s[1] !== s[1].toLowerCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

/** Énumération à la française : « R01 », « R01 et R02 », « R01, R02 et R03 ». */
export function enumerer(mots: string[]): string {
  if (mots.length <= 1) return mots[0] ?? '';
  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
}

/** Où se trouve une alarme : le numéro de la machine et le nom de l'organe, tels qu'affichés. */
export interface LieuAlarme {
  numero: string;
  organe?: string;
}

export interface Verdict {
  ton: Ton;
  texte: string;
  /** Une ligne courte, seulement pendant une panne : qui s'en occupe (ou personne encore). */
  suite?: string;
  /** Version stable pour les lecteurs d'écran : sans la durée qui change chaque seconde. */
  annonce?: string;
  /** Alarme à montrer quand on clique sur l'action du verdict. */
  alarmeId?: string;
  action?: string;
}

const cote = (l: LieuAlarme) => (l.organe ? `, côté ${minusculeInitiale(l.organe)}` : '');

/** Ce qui ne produit pas, groupé par état : « R06 est en réglage (calage). PV01 est à l'arrêt. » */
export function nonProductives(a: EtatAtelier): string | undefined {
  const phrases: string[] = [];
  for (const etat of ['panne', 'calage', 'arret'] as const) {
    const ms = a.parEtat[etat];
    if (!ms.length) continue;
    const qui = ms.length <= 3 ? enumerer(ms.map((m) => m.numero)) : `${ms.length} machines`;
    phrases.push(`${qui} ${ms.length > 1 ? 'sont' : 'est'} ${ETAT_DANS_PHRASE[etat]}.`);
  }
  return phrases.length ? phrases.join(' ') : undefined;
}

/**
 * La phrase du bandeau : la réponse à « est-ce que tout va bien ? », recalculée à chaque seconde. Ce que les repères
 * montrent déjà (combien de machines produisent, combien d'alarmes) n'y est pas répété.
 * `alarmes` doit être triée par urgence (parUrgence).
 */
export function verdictAtelier(a: EtatAtelier, alarmes: Alarme[], lieu: (al: Alarme) => LieuAlarme, now: number): Verdict {
  if (!a.total) return { ton: 'neutre', texte: 'Aucune machine dans cette usine pour l’instant.' };
  if (!a.suivies && !a.horsLigne.length) return { ton: 'neutre', texte: 'Connexion aux machines en cours…' };

  const pannes = alarmes.filter((x) => x.gravite === 'critique');
  const aSurveiller = alarmes.filter((x) => x.gravite !== 'critique');

  if (pannes.length) {
    const p = pannes[0];
    const l = lieu(p);
    const depuis = fmtDuration(now - p.horodatage);
    const texte =
      pannes.length === 1
        ? `Panne sur ${l.numero} depuis ${depuis}${cote(l)}.`
        : `${pannes.length} pannes en cours. La plus urgente : ${l.numero}, depuis ${depuis}${cote(l)}.`;
    const priseEnCharge = p.statut === 'acquittee' ? `Prise en charge${p.acquitteePar ? ` par ${p.acquitteePar}` : ''}.` : 'Pas encore prise en charge.';
    const annonce = pannes.length === 1 ? `Panne sur ${l.numero}${cote(l)}.` : `${pannes.length} pannes en cours, dont ${l.numero}${cote(l)}.`;
    return { ton: 'crit', texte, annonce, suite: priseEnCharge, alarmeId: p.id, action: 'Voir la panne' };
  }

  if (aSurveiller.length) {
    const w = aSurveiller[0];
    const l = lieu(w);
    const texte =
      aSurveiller.length === 1
        ? `Aucune panne. Un point à surveiller sur ${l.numero}${cote(l)}.`
        : `Aucune panne. ${aSurveiller.length} points à surveiller, dont ${l.numero}${cote(l)}.`;
    return { ton: 'warn', texte, alarmeId: w.id, action: 'Voir' };
  }

  if (a.horsLigne.length) {
    const qui = a.horsLigne.length <= 3 ? enumerer(a.horsLigne.map((m) => m.numero)) : `${a.horsLigne.length} machines`;
    return { ton: 'warn', texte: `Plus de nouvelles de ${qui} : la liaison avec ${a.horsLigne.length > 1 ? 'ces machines' : 'la machine'} est coupée.` };
  }

  if (!a.produisent) return { ton: 'neutre', texte: 'Aucune machine ne produit en ce moment, et aucune alarme.' };
  const texte =
    a.produisent === a.total
      ? `Tout tourne : ${a.total > 1 ? `les ${a.total} machines produisent` : 'la machine produit'}, aucune alarme.`
      : `Tout tourne : ${a.produisent} machine${a.produisent > 1 ? 's' : ''} sur ${a.total} ${a.produisent > 1 ? 'produisent' : 'produit'}, aucune alarme.`;
  return { ton: 'ok', texte };
}

/** TRS instantané de l'atelier, et production cumulée depuis l'ouverture de la page. */
export function trsInstantane(machines: Machine[], live: Record<string, MachineLive | undefined>) {
  let trs = 0;
  let n = 0;
  let bonnes = 0;
  let gache = 0;
  for (const m of machines) {
    const l = live[m.id];
    // Hors ligne : ni en production ni à l'arrêt, on ne sait pas. La machine sort du calcul.
    if (!l || l.horsLigne) continue;
    bonnes += l.bonnes;
    gache += l.gache;
    if (l.etat === 'arret') continue;
    n++;
    const q = l.bonnes + l.gache > 0 ? l.bonnes / (l.bonnes + l.gache) : 1;
    trs += (l.etat === 'marche' || l.etat === 'attention' ? 1 : 0) * Math.min(1, l.facteur) * q;
  }
  return { trs: n ? trs / n : 0, bonnes, gache };
}
