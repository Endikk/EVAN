/**
 * Calculs de l'historique, sans React : temps d'arrêt et efficacité par machine, pannes par organe, alarmes par jour,
 * pannes qui reviennent. Tout part de l'historique simulé (périodes d'état, TRS journalier, alarmes) : aucun chiffre
 * n'est inventé, et une machine qui n'a pas été ouverte sur la période n'a simplement pas d'efficacité.
 */
import type { Alarme, Machine, PointDeMesure } from '@/domain/types';
import type { MachineModel } from '@/domain/catalog';
import { DAY, H, periodAt, type History } from '@/sim/history';

export type Periode = '24h' | '7j';

export interface LigneMachine {
  m: Machine;
  /** Durées en millisecondes sur la période. */
  panne: number;
  calage: number;
  marche: number;
  ouverture: number;
  /** Nombre d'arrêts sur panne. */
  nPannes: number;
  /** Nombre de réglages (calages) : avec leur durée totale, il dit si l'atelier règle souvent ou longtemps. */
  nCalages: number;
  /** Temps de panne par organe (ms). */
  parOrgane: ReadonlyMap<string, number>;
  /** Disponibilité, vitesse, qualité et efficacité (0 à 1). Absentes si la machine n'a pas été ouverte. */
  D?: number;
  P?: number;
  Q?: number;
  trs?: number;
}

function chevauchement(a0: number, a1: number, b0: number, b1: number) {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

/** Temps d'arrêt et efficacité d'une machine entre `from` et `to`. */
export function ligneMachine(h: History, m: Machine, from: number, to: number): LigneMachine {
  let panne = 0;
  let calage = 0;
  let marche = 0;
  let ouverture = 0;
  let nPannes = 0;
  let nCalages = 0;
  const parOrgane = new Map<string, number>();
  for (const p of h.periodes[m.id] ?? []) {
    const d = chevauchement(p.debut, p.fin, from, to);
    if (!d) continue;
    if (p.etat !== 'arret') ouverture += d;
    if (p.etat === 'panne') {
      panne += d;
      nPannes++;
      if (p.organeId) parOrgane.set(p.organeId, (parOrgane.get(p.organeId) ?? 0) + d);
    } else if (p.etat === 'calage') {
      calage += d;
      nCalages++;
    } else if (p.etat === 'marche') marche += d;
  }
  const base = { m, panne, calage, marche, ouverture, nPannes, nCalages, parOrgane };
  // Vitesse et qualité viennent du TRS journalier, pondéré par le temps d'ouverture de chaque jour touché.
  const jours = (h.trs[m.id] ?? []).filter((j) => j.jour + DAY > from && j.ouvertureMin > 0);
  const poids = jours.reduce((s, j) => s + j.ouvertureMin, 0);
  if (!ouverture || !poids) return base;
  const P = jours.reduce((s, j) => s + j.performance * j.ouvertureMin, 0) / poids;
  const Q = jours.reduce((s, j) => s + j.qualite * j.ouvertureMin, 0) / poids;
  const D = marche / ouverture;
  return { ...base, D, P, Q, trs: D * P * Q };
}

export interface Bilan {
  lignes: LigneMachine[];
  panne: number;
  calage: number;
  ouverture: number;
  nPannes: number;
  nCalages: number;
  /** Moyennes pondérées par le temps d'ouverture, absentes si aucune machine n'a été ouverte. */
  trs?: number;
  D?: number;
  P?: number;
  Q?: number;
}

const somme = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Totaux et moyennes d'un ensemble de machines. */
export function bilan(lignes: LigneMachine[]): Bilan {
  const ouvertes = lignes.filter((l) => l.trs !== undefined);
  const ouverture = somme(ouvertes.map((l) => l.ouverture));
  const moyenne = (k: 'trs' | 'D' | 'P' | 'Q') => (ouverture ? somme(ouvertes.map((l) => (l[k] ?? 0) * l.ouverture)) / ouverture : undefined);
  return {
    lignes,
    panne: somme(lignes.map((l) => l.panne)),
    calage: somme(lignes.map((l) => l.calage)),
    ouverture: somme(lignes.map((l) => l.ouverture)),
    nPannes: somme(lignes.map((l) => l.nPannes)),
    nCalages: somme(lignes.map((l) => l.nCalages)),
    trs: moyenne('trs'),
    D: moyenne('D'),
    P: moyenne('P'),
    Q: moyenne('Q'),
  };
}

/** La machine la plus arrêtée (pannes et réglages), s'il y en a une qui s'est arrêtée. */
export function plusArretee(lignes: LigneMachine[]): LigneMachine | undefined {
  const triees = [...lignes].sort((a, b) => b.panne + b.calage - (a.panne + a.calage));
  return triees[0] && triees[0].panne + triees[0].calage > 0 ? triees[0] : undefined;
}

export interface BilanAlarmes {
  critiques: Alarme[];
  /** Défauts répétitifs distincts (même code sur la même machine). */
  nRepetitifs: number;
  /** Temps moyen de réparation des alarmes critiques terminées (ms). */
  mttr?: number;
  /** La réparation la plus longue. */
  plusLongue?: Alarme;
  /** Délai moyen avant qu'une alarme soit vue (ms). */
  acquittement?: number;
}

export function bilanAlarmes(alarmes: Alarme[]): BilanAlarmes {
  const critiques = alarmes.filter((a) => a.gravite === 'critique');
  const finies = critiques.filter((a) => a.finLe !== undefined);
  const duree = (a: Alarme) => (a.finLe ?? a.horodatage) - a.horodatage;
  const vues = alarmes.filter((a) => a.acquitteeLe !== undefined);
  const repetitifs = new Set(alarmes.filter((a) => a.regle === 'repetitif').map((a) => `${a.machineId}|${a.code}`));
  return {
    critiques,
    nRepetitifs: repetitifs.size,
    mttr: finies.length ? somme(finies.map(duree)) / finies.length : undefined,
    plusLongue: finies.length ? finies.reduce((a, b) => (duree(b) > duree(a) ? b : a)) : undefined,
    acquittement: vues.length ? somme(vues.map((a) => a.acquitteeLe! - a.horodatage)) / vues.length : undefined,
  };
}

export interface LigneOrgane {
  id: string;
  /** Nom de l'organe (« 3. Séchage UV » pour une seule machine). */
  nom: string;
  /** Type de machine, quand les organes de toutes les machines sont regroupés. */
  type?: string;
  ms: number;
  /**
   * Quand les organes sont regroupés par type, ce que chaque machine y a perdu, de la plus touchée à la moins touchée :
   * la barre dit « le rembobineur des rotatives offset », la bulle dit sur lesquelles.
   */
  machines?: { numero: string; ms: number }[];
}

/**
 * Temps de panne par organe, du plus touché au moins touché. Pour une seule machine, ses organes ; pour toutes,
 * les organes regroupés par type de machine (la découpe de toutes les rotatives offset ensemble).
 */
export function pannesParOrgane(lignes: LigneMachine[], modeles: ReadonlyMap<string, MachineModel>, uneMachine: boolean, limite = 8): LigneOrgane[] {
  const cumul = new Map<string, LigneOrgane>();
  for (const l of lignes) {
    const modele = modeles.get(l.m.id);
    for (const [oid, ms] of l.parOrgane) {
      const o = modele?.organes.find((x) => x.id === oid);
      const nom = o?.nom ?? oid;
      const id = uneMachine ? oid : `${l.m.type}|${nom}`;
      const prec = cumul.get(id);
      cumul.set(id, {
        id,
        nom: uneMachine && o ? `${o.numero}. ${o.nom}` : nom,
        type: uneMachine ? undefined : (modele?.type?.libelle ?? l.m.type),
        ms: (prec?.ms ?? 0) + ms,
        machines: uneMachine ? undefined : [...(prec?.machines ?? []), { numero: l.m.numero, ms }],
      });
    }
  }
  return [...cumul.values()]
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limite)
    .map((o) => (o.machines ? { ...o, machines: [...o.machines].sort((a, b) => b.ms - a.ms) } : o));
}

export interface JourTrs {
  t: number;
  /** Pourcentages entiers. */
  trs: number;
  D: number;
  P: number;
  Q: number;
}

/** Efficacité jour par jour, moyenne des machines pondérée par leur temps d'ouverture. */
export function trsParJour(lignes: LigneMachine[], h: History, from: number): JourTrs[] {
  const jours = new Map<number, { w: number; trs: number; D: number; P: number; Q: number }>();
  for (const l of lignes) {
    for (const j of h.trs[l.m.id] ?? []) {
      if (j.ouvertureMin <= 0 || j.jour + DAY <= from) continue;
      const c = jours.get(j.jour) ?? { w: 0, trs: 0, D: 0, P: 0, Q: 0 };
      const w = j.ouvertureMin;
      jours.set(j.jour, { w: c.w + w, trs: c.trs + j.trs * w, D: c.D + j.disponibilite * w, P: c.P + j.performance * w, Q: c.Q + j.qualite * w });
    }
  }
  return [...jours.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, d]) => ({ t, trs: Math.round((d.trs / d.w) * 100), D: Math.round((d.D / d.w) * 100), P: Math.round((d.P / d.w) * 100), Q: Math.round((d.Q / d.w) * 100) }));
}

/** Alarmes critiques par jour, de minuit à minuit, jours sans alarme compris. */
export function critiquesParJour(alarmes: Alarme[], from: number, now: number): { t: number; v: number }[] {
  const jours = new Map<number, number>();
  const debut = new Date(from);
  debut.setHours(0, 0, 0, 0);
  for (let t = debut.getTime(); t <= now; t += DAY) jours.set(t, 0);
  for (const a of alarmes) {
    if (a.gravite !== 'critique') continue;
    const d = new Date(a.horodatage);
    d.setHours(0, 0, 0, 0);
    jours.set(d.getTime(), (jours.get(d.getTime()) ?? 0) + 1);
  }
  return [...jours.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, v }));
}

/** Une colonne d'alarmes : son début, sa fin, le nombre d'alarmes critiques entre les deux. */
export interface TrancheAlarmes {
  t: number;
  fin: number;
  v: number;
}

/** Largeur d'une tranche sur 24 heures : six colonnes, calées sur l'horloge (0 h, 4 h, 8 h…). */
const TRANCHE_24H = 4;

/**
 * Alarmes critiques par colonne. Sur 7 jours, une colonne par jour, de minuit à minuit. Sur 24 heures, une colonne par
 * tranche de 4 heures : une colonne « jeudi » qui ne compterait que depuis midi dirait autre chose que la même
 * colonne sur 7 jours. La première tranche commence au début de la fenêtre, pas avant.
 */
export function critiquesParTranche(alarmes: Alarme[], periode: Periode, from: number, now: number): TrancheAlarmes[] {
  if (periode === '7j') {
    return critiquesParJour(alarmes, from, now).map(({ t, v }) => {
      const fin = new Date(t);
      fin.setDate(fin.getDate() + 1);
      return { t, fin: fin.getTime(), v };
    });
  }
  const bornes = [from];
  const d = new Date(from);
  d.setHours(Math.floor(d.getHours() / TRANCHE_24H) * TRANCHE_24H + TRANCHE_24H, 0, 0, 0);
  for (; d.getTime() < now; d.setHours(d.getHours() + TRANCHE_24H)) bornes.push(d.getTime());
  const critiques = alarmes.filter((a) => a.gravite === 'critique' && a.horodatage >= from && a.horodatage < now);
  return bornes.map((t, i) => {
    const fin = bornes[i + 1] ?? now;
    return { t, fin, v: critiques.filter((a) => a.horodatage >= t && a.horodatage < fin).length };
  });
}

export interface PanneRecurrente {
  id: string;
  code: string;
  message: string;
  machineId: string;
  numero: string;
  n: number;
  ms: number;
}

/**
 * Les pannes (alarmes critiques) regroupées par code et par machine, seulement celles qui sont revenues : une panne
 * survenue une seule fois n'est pas « une panne qui revient ».
 */
export function pannesRecurrentes(alarmes: Alarme[], machines: Machine[], now: number): PanneRecurrente[] {
  const parCle = new Map<string, PanneRecurrente>();
  for (const a of alarmes) {
    if (a.gravite !== 'critique') continue;
    const id = `${a.code}|${a.machineId}`;
    const prec = parCle.get(id);
    const ms = (a.finLe ?? now) - a.horodatage;
    parCle.set(id, {
      id,
      code: a.code,
      message: a.message,
      machineId: a.machineId,
      numero: machines.find((m) => m.id === a.machineId)?.numero ?? '',
      n: (prec?.n ?? 0) + 1,
      ms: (prec?.ms ?? 0) + ms,
    });
  }
  return [...parCle.values()].filter((p) => p.n >= 2);
}

/** Graduations lisibles de l'axe du temps : chaque minuit sur 7 jours, toutes les 4 h sur 24 h. */
export function graduationsTemps(periode: Periode, from: number, now: number): number[] {
  const out: number[] = [];
  const pas = periode === '24h' ? 4 * H : DAY;
  const d = new Date(from);
  if (periode === '24h') d.setHours(Math.ceil((d.getHours() + 1) / 4) * 4, 0, 0, 0);
  else d.setHours(24, 0, 0, 0);
  for (let t = d.getTime(); t < now; t += pas) out.push(t);
  return out;
}

export interface TenueMesure {
  /** Part des relevés pris pendant la marche qui restent dans la plage normale (0 à 1). */
  part?: number;
  /** Nombre de relevés pris pendant la marche. */
  n: number;
  /** Des relevés sortent de la plage pendant que la machine est arrêtée (nuit, réglage) : des creux sans défaut. */
  creuxALArret: boolean;
}

/**
 * Comment une mesure a tenu sa plage normale (entre ses seuils d'attention), seulement pendant que la machine
 * produisait : la nuit, la tension de bande tombe à zéro sans que ce soit un défaut.
 */
export function tenueMesure(serie: { t: number; v: number }[], seuils: PointDeMesure['seuils'], h: History, machineId: string): TenueMesure {
  if (seuils.attentionBas === undefined && seuils.attentionHaut === undefined) return { n: 0, creuxALArret: false };
  const periodes = h.periodes[machineId] ?? [];
  const bas = seuils.attentionBas ?? -Infinity;
  const haut = seuils.attentionHaut ?? Infinity;
  const dans = (v: number) => v >= bas && v <= haut;
  const enMarche = serie.filter((p) => periodAt(periodes, p.t)?.etat === 'marche');
  const creuxALArret = serie.some((p) => !dans(p.v) && periodAt(periodes, p.t)?.etat === 'arret');
  if (!enMarche.length) return { n: 0, creuxALArret };
  return { part: enMarche.filter((p) => dans(p.v)).length / enMarche.length, n: enMarche.length, creuxALArret };
}
