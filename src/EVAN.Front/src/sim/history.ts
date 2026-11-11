/**
 * Historique simulé des 7 derniers jours, déterministe (mêmes données à chaque visite) :
 * périodes d'état par machine, alarmes passées, TRS journalier, courbes de mesures.
 */
import type { Alarme, Machine, PointDeMesure } from '@/domain/types';
import { machineModel, type MesureDef, type PanneDef } from '@/domain/catalog';
import { classify } from './rules';
import { hashNoise, hashString, mulberry32, stableGauss } from './random';

export type EtatPeriode = 'marche' | 'calage' | 'arret' | 'panne';

export interface Periode {
  debut: number;
  fin: number;
  etat: EtatPeriode;
  organeId?: string;
  alarmeId?: string;
}

export interface TrsJour {
  jour: number;
  disponibilite: number;
  performance: number;
  qualite: number;
  trs: number;
  ouvertureMin: number;
  marcheMin: number;
  panneMin: number;
  calageMin: number;
}

export interface History {
  debut: number;
  fin: number;
  periodes: Record<string, Periode[]>;
  alarmes: Alarme[];
  trs: Record<string, TrsJour[]>;
}

export const H = 3600_000;
export const MIN = 60_000;
export const DAY = 24 * H;
/** Avant une panne, la mesure en cause glisse vers le seuil d'alarme pendant ces quelques minutes. */
export const GLISSEMENT = 6 * MIN;
/** Calage de reprise après une intervention. */
const REPRISE = 4 * MIN;

const EQUIPES = ['Équipe matin', 'Équipe après-midi'];

/** Durée tirée en minutes, arrondie à la seconde : tous les horodatages de l'historique sont des millisecondes entières. */
const minutes = (m: number) => Math.round(m * 60) * 1000;

/** Fenêtres d'ouverture : de 5 h à 21 h en semaine, samedi matin pour l'impression. */
function ouverture(dayStart: number, categorie: string): [number, number] | null {
  const d = new Date(dayStart).getDay();
  if (d === 0) return null;
  if (d === 6) return categorie === 'impression' ? [dayStart + 5 * H, dayStart + 13 * H] : null;
  return [dayStart + 5 * H, dayStart + 21 * H];
}

/** Relève des équipes : le matin commence à 5 h, l'après-midi à 13 h (heure locale). */
const POSTES_H = [5, 13];

/**
 * Début du poste en cours (heure locale) : 5 h le matin, 13 h l'après-midi. Avant 5 h, c'est encore le poste
 * d'après-midi de la veille qui compte : les chiffres de production se lisent « depuis le début du poste ».
 */
export function debutDePoste(now: number): number {
  const d = new Date(now);
  const h = d.getHours();
  const poste = [...POSTES_H].reverse().find((p) => h >= p);
  if (poste === undefined) {
    d.setDate(d.getDate() - 1);
    d.setHours(POSTES_H[POSTES_H.length - 1], 0, 0, 0);
  } else d.setHours(poste, 0, 0, 0);
  return d.getTime();
}

/** Quelques historiques en mémoire : l'usine active, et les autres pour la vue organisation. */
const cache = new Map<string, History>();
const CACHE_MAX = 6;

export function getHistory(machines: Machine[], now = Date.now()): History {
  // Clé à l'heure près : l'historique ne bouge pas pendant une session de démo.
  const hour = Math.floor(now / H) * H;
  const key = `${hour}|${machines.map((m) => `${m.id}:${m.type}`).join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const data = generate(machines, hour);
  cache.set(key, data);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return data;
}

function generate(machines: Machine[], fin: number): History {
  const today = new Date(fin);
  today.setHours(0, 0, 0, 0);
  const debut = today.getTime() - 6 * DAY;
  const periodes: Record<string, Periode[]> = {};
  const alarmes: Alarme[] = [];
  const trs: Record<string, TrsJour[]> = {};

  for (const m of machines) {
    // Machine ajoutée pendant la session : pas encore d'historique.
    if (m.creeLe) continue;
    const model = machineModel(m);
    const type = model.type;
    const rnd = mulberry32(hashString(m.id));
    const faultOrganes = model.organes.filter((o) => model.defs[o.id]?.panne);
    const list: Periode[] = [];
    const jours: TrsJour[] = [];
    // Fiabilité propre à chaque machine : la numérique et la flexo récente tombent moins en panne.
    const fragilite = m.type === 'offset' ? 0.13 : m.type === 'flexo' ? 0.09 : 0.07;
    const perfBase = 0.84 + rnd() * 0.08;

    for (let d = 0; d < 7; d++) {
      const dayStart = debut + d * DAY;
      const win = ouverture(dayStart, type?.categorie ?? 'atelier');
      const jour: TrsJour = { jour: dayStart, disponibilite: 0, performance: 0, qualite: 0, trs: 0, ouvertureMin: 0, marcheMin: 0, panneMin: 0, calageMin: 0 };
      if (!win) {
        list.push({ debut: dayStart, fin: dayStart + DAY, etat: 'arret' });
        jours.push(jour);
        continue;
      }
      list.push({ debut: dayStart, fin: win[0], etat: 'arret' });
      let t = win[0];
      const end = Math.min(win[1], fin);
      while (t < end) {
        // Calage en début de travail.
        const calage = minutes(8 + rnd() * 17);
        list.push({ debut: t, fin: Math.min(t + calage, end), etat: 'calage' });
        jour.calageMin += Math.min(calage, end - t) / MIN;
        t += calage;
        if (t >= end) break;
        const run = minutes(70 + rnd() * 130);
        const runEnd = Math.min(t + run, end);
        if (faultOrganes.length && rnd() < fragilite) {
          // Panne au milieu du travail.
          const at = t + Math.round(((runEnd - t) * (0.3 + rnd() * 0.5)) / 1000) * 1000;
          const organe = faultOrganes[Math.floor(rnd() * faultOrganes.length)];
          const dur = minutes(5 + rnd() ** 2 * 70);
          list.push({ debut: t, fin: at, etat: 'marche' });
          jour.marcheMin += (at - t) / MIN;
          const pEnd = Math.min(at + dur, end);
          const alarm = pastAlarm(m, organe.id, model.defs[organe.id], at, pEnd, rnd);
          alarmes.push(alarm);
          list.push({ debut: at, fin: pEnd, etat: 'panne', organeId: organe.id, alarmeId: alarm.id });
          jour.panneMin += (pEnd - at) / MIN;
          t = pEnd;
          // Après l'intervention, la machine repart par un court calage (réglages, première bande contrôlée).
          const reprise = Math.min(t + REPRISE, runEnd);
          if (t < reprise) {
            list.push({ debut: t, fin: reprise, etat: 'calage' });
            jour.calageMin += (reprise - t) / MIN;
            t = reprise;
          }
          if (t < runEnd) {
            list.push({ debut: t, fin: runEnd, etat: 'marche' });
            jour.marcheMin += (runEnd - t) / MIN;
          }
        } else {
          list.push({ debut: t, fin: runEnd, etat: 'marche' });
          jour.marcheMin += (runEnd - t) / MIN;
        }
        // Une panne qui déborde la fin du travail repousse le suivant : le temps ne revient jamais en arrière.
        t = Math.max(t, runEnd);
      }
      if (win[1] < dayStart + DAY && win[1] <= fin) list.push({ debut: win[1], fin: dayStart + DAY, etat: 'arret' });
      jour.ouvertureMin = (Math.min(win[1], fin) - win[0]) / MIN;
      if (jour.ouvertureMin > 0) {
        jour.disponibilite = jour.marcheMin / jour.ouvertureMin;
        jour.performance = Math.min(0.98, perfBase + (rnd() - 0.5) * 0.06);
        jour.qualite = Math.max(0.9, 0.985 - (jour.calageMin / jour.ouvertureMin) * 0.12 - rnd() * 0.012);
        jour.trs = jour.disponibilite * jour.performance * jour.qualite;
      }
      jours.push(jour);
    }
    periodes[m.id] = list.filter((p) => p.fin > p.debut && p.debut < fin).map((p) => ({ ...p, fin: Math.min(p.fin, fin) }));
    trs[m.id] = jours;
  }

  // Défaut répétitif scénarisé : casse d'échenillage sur la flexo, trois fois dans la dernière journée travaillée.
  // Seulement sur une flexo qui a un historique : une presse posée pendant la session (creeLe) n'a pas de périodes,
  // et le scénario ne s'y écrit pas (sinon « Terminer » plantait dès qu'une flexo venait d'être posée).
  const flexo = machines.find((m) => m.type === 'flexo' && periodes[m.id]);
  if (flexo) {
    const model = machineModel(flexo);
    const ech = model.organes.find((o) => o.numero === 7);
    for (let d = 0; d < 7 && ech; d++) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);
      const win = ouverture(day.getTime(), 'impression');
      if (!win || Math.min(win[1], fin) - win[0] < 5 * H) continue;
      const rnd = mulberry32(42);
      for (const off of [1.1, 2.6, 4.3]) {
        const at = win[0] + Math.round(off * 3600) * 1000;
        const a = pastAlarm(flexo, ech.id, model.defs[ech.id], at, at + 9 * MIN, rnd);
        alarmes.push(a);
        insertPanne(periodes[flexo.id], { debut: at, fin: at + 9 * MIN, etat: 'panne', organeId: ech.id, alarmeId: a.id });
      }
      break;
    }
  }

  alarmes.sort((a, b) => b.horodatage - a.horodatage);
  return { debut, fin, periodes, alarmes, trs };
}

function insertPanne(list: Periode[], p: Periode) {
  const out: Periode[] = [];
  for (const q of list) {
    if (q.fin <= p.debut || q.debut >= p.fin) out.push(q);
    else {
      if (q.debut < p.debut) out.push({ ...q, fin: p.debut });
      if (q.fin > p.fin) out.push({ ...q, debut: p.fin });
    }
  }
  out.push(p);
  out.sort((a, b) => a.debut - b.debut);
  list.splice(0, list.length, ...out);
}

function pastAlarm(m: Machine, organeId: string, def: ReturnType<typeof machineModel>['defs'][string], at: number, end: number, rnd: () => number): Alarme {
  const panne = def?.panne;
  const mesure = def?.mesures.find((x) => x.cle === panne?.mesure);
  const valeur = panne ? panne.cible + (rnd() - 0.5) * Math.abs(panne.cible - (mesure?.nominal ?? panne.cible)) * 0.15 : undefined;
  const id = `h-${m.id}-${Math.round(at / 1000)}`;
  // Acquittement 40 s à 4 min après l'alarme, tiré de l'identifiant pour ne pas décaler la suite de l'aléa.
  const acquitteeLe = Math.min(end, at + Math.round(40 + hashNoise(hashString(id), 1) * 200) * 1000);
  return {
    id,
    code: def?.alarme?.code ?? 'EV-00',
    message: def?.alarme?.message ?? 'Défaut',
    gravite: 'critique',
    machineId: m.id,
    organeId,
    pointId: panne ? `${organeId}.${panne.mesure}` : undefined,
    horodatage: at,
    valeur: valeur !== undefined ? round(valeur) : undefined,
    unite: mesure?.unite,
    seuil: mesure ? (panne!.cible > mesure.nominal ? mesure.seuils.alarmeHaut : mesure.seuils.alarmeBas) : undefined,
    statut: 'resolue',
    regle: mesure?.type === 'alarme' ? 'automate' : 'seuil',
    cause: panne?.cause,
    finLe: end,
    acquitteePar: EQUIPES[new Date(at).getHours() < 13 ? 0 : 1],
    acquitteeLe,
  };
}

function round(v: number) {
  return Math.abs(v) < 10 ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10;
}

/** Les alarmes de l'historique marquées « répétitives » (≥ 3 fois en 8 h). */
export function markRepetitive(alarms: Alarme[]): Alarme[] {
  const byKey = new Map<string, Alarme[]>();
  for (const a of alarms) {
    if (a.gravite !== 'critique') continue;
    const k = `${a.machineId}|${a.code}`;
    byKey.set(k, [...(byKey.get(k) ?? []), a]);
  }
  const rep = new Map<string, number>();
  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => a.horodatage - b.horodatage);
    sorted.forEach((a, i) => {
      const n = sorted.filter((b, j) => j <= i && a.horodatage - b.horodatage <= 8 * H).length;
      if (n >= 3) rep.set(a.id, n);
    });
  }
  return alarms.map((a) => (rep.has(a.id) ? { ...a, regle: 'repetitif', repetitions: rep.get(a.id) } : a));
}

/** Indice de la période d'état qui couvre l'instant t (recherche dichotomique), -1 hors historique. */
export function periodIndex(list: Periode[], t: number): number {
  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const p = list[mid];
    if (t < p.debut) hi = mid - 1;
    else if (t >= p.fin) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/** Période d'état d'une machine à l'instant t. */
export function periodAt(list: Periode[], t: number): Periode | undefined {
  return list[periodIndex(list, t)];
}

/**
 * Usure atteinte à la fin de l'historique : le nominal du catalogue, à 30 % près selon la machine (tirage stable sur le
 * point, même tirage que HistoriqueSimule.NiveauUsure côté back), pour que deux machines du même type ne montrent pas le
 * même compteur. L'historique la fait croître jusque-là au même rythme ; la simulation en direct peut en partir.
 */
export function niveauUsure(pointId: string, nominal: number): number {
  return nominal * (0.7 + hashNoise(hashString(pointId), 3) * 0.6);
}

/** Valeur historique d'une mesure à l'instant t (`panne` : la panne type de son organe, s'il en a une). */
export function historicValue(h: History, machine: Machine, point: PointDeMesure, def: MesureDef, panne: PanneDef | undefined, t: number): number {
  const seed = hashString(point.id);
  const i = Math.floor(t / (5 * MIN));
  const p = periodAt(h.periodes[machine.id] ?? [], t);
  const type = machineModel(machine).type;
  const nominalSpeed = type?.vitesse.nominale ?? def.nominal;
  // Bruit lissé : variations lentes (nœuds toutes les 40 min, interpolés) + un peu de bruit fin.
  const k = t / (40 * MIN);
  const k0 = Math.floor(k);
  const f = k - k0;
  const smooth = stableGauss(seed, k0) * (1 - f) + stableGauss(seed, k0 + 1) * f;
  const noise = smooth * def.bruit * 2 + stableGauss(seed ^ 0x5bd1e995, i) * def.bruit * 0.5;
  const daily = Math.sin((t / (6 * H)) * Math.PI * 2 + (seed % 7)) * def.bruit * 1.5;
  // Machine à l'arrêt : plus de tension ni de pression, températures à l'ambiante.
  if (p?.etat === 'arret' && !def.role && !def.dynamique) {
    if (['tension', 'pression', 'couple', 'puissance', 'vitesse'].includes(def.type)) return Math.max(0, stableGauss(seed, i) * def.bruit * 0.2);
    if (def.type === 'temperature') return Math.min(def.nominal, 20.5) + stableGauss(seed, i) * 0.15;
  }

  if (def.role === 'vitesse') {
    if (!p || p.etat === 'arret' || p.etat === 'panne') return 0;
    if (p.etat === 'calage') return Math.max(0, nominalSpeed * 0.18 + noise);
    return Math.max(0, nominalSpeed * (0.9 + 0.05 * Math.sin(t / (47 * MIN) + seed)) + noise * 3);
  }
  if (def.role === 'alarmes') return p?.etat === 'panne' ? 1 : 0;
  if (def.dynamique === 'compteur') return Math.floor(((t - h.debut) / 1000) * 8);

  let v = def.nominal + daily + noise;
  if (def.dynamique === 'decroit') {
    const cycle = 55 * MIN + (seed % 20) * MIN;
    const ph = ((t + seed * 1000) % cycle) / cycle;
    const low = (def.seuils.attentionBas ?? def.nominal * 0.25) * 1.2;
    v = def.nominal - (def.nominal - low) * ph;
  } else if (def.dynamique === 'croit') {
    if (def.type === 'usure') v = niveauUsure(point.id, def.nominal) - ((h.fin - t) / DAY) * (def.nominal * 0.015);
    else {
      const cycle = 70 * MIN;
      const ph = ((t + seed * 1000) % cycle) / cycle;
      const high = (def.seuils.attentionHaut ?? def.nominal * 2) * 0.9;
      v = def.nominal + (high - def.nominal) * ph;
    }
  }
  // Vieillissement d'une lampe UV : baisse lente sur la semaine (scénario de dérive de la démo).
  if (machine.id === 'm-r04' && point.cle === 'puissance_uv') v = 84 - ((t - h.debut) / (h.fin - h.debut)) * 8.5 + noise;

  // Autour d'une panne : la mesure en cause glisse jusqu'au seuil d'alarme, franchi à l'instant de l'alarme
  // (la machine s'arrête), puis rejoint sa valeur de défaut. Un défaut franc (« saut ») bascule d'un coup.
  if (panne?.mesure === point.cle) {
    const list = h.periodes[machine.id] ?? [];
    const near = list.find((q) => q.etat === 'panne' && q.organeId === point.organeId && t >= q.debut - GLISSEMENT && t < q.fin);
    if (near) v = autourDePanne(v, t, near.debut, panne, point.seuils, def.nominal);
  }
  return v;
}

/** Seuil d'alarme franchi par une panne (du côté de sa valeur cible). */
export function seuilDePanne(panne: PanneDef, seuils: PointDeMesure['seuils'], nominal: number): number | undefined {
  return panne.cible >= nominal ? seuils.alarmeHaut : seuils.alarmeBas;
}

function autourDePanne(v: number, t: number, debut: number, panne: PanneDef, seuils: PointDeMesure['seuils'], nominal: number): number {
  if (t >= debut) {
    if (panne.forme === 'saut') return panne.cible;
    // Après l'arrêt, la mesure finit de rejoindre sa valeur de défaut en 45 s.
    const depart = seuilDePanne(panne, seuils, nominal) ?? v;
    return depart + (panne.cible - depart) * Math.min(1, (t - debut) / 45_000);
  }
  if (panne.forme === 'saut') return v;
  const seuil = seuilDePanne(panne, seuils, nominal) ?? panne.cible;
  // Glissement de plus en plus rapide : la tendance se voit d'abord à peine, puis s'accélère jusqu'au seuil.
  const k = Math.max(0, 1 - (debut - t) / GLISSEMENT);
  return v + (seuil - v) * k ** 1.6;
}

/** Série échantillonnée pour les courbes. */
export function historicSeries(h: History, machine: Machine, point: PointDeMesure, from: number, to: number, step: number) {
  const model = machineModel(machine);
  const def = model.defs[point.organeId];
  const mdef = def?.mesures.find((m) => m.cle === point.cle);
  const out: { t: number; v: number; niveau: ReturnType<typeof classify> }[] = [];
  if (!mdef) return out;
  for (let t = from; t <= to; t += step) {
    const v = historicValue(h, machine, point, mdef, def?.panne, t);
    out.push({ t, v, niveau: classify(v, point.seuils) });
  }
  return out;
}
