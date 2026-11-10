/**
 * Carnet de maintenance (vocabulaire NF EN 13306) :
 *  - maintenance systématique : tâches du plan à intervalle d'heures de marche ou de jours, avec leur compteur ;
 *  - maintenance conditionnelle : tâches déclenchées par un point de mesure d'usure (mètres d'outil, heures de
 *    blanchet…), échéance prévue d'après la tendance ;
 *  - maintenance prévisionnelle : dérives régulières détectées sur l'historique (régression linéaire), avec la date
 *    probable de franchissement du seuil ;
 *  - journal des interventions : curatives (alarmes critiques résolues), préventives réalisées, saisies de l'atelier ;
 *  - indicateurs : MTBF, MTTR, temps moyen d'acquittement, part du préventif.
 *
 * Même logique que src/EVAN.Core/Domain/Maintenance ; cas de test communs : data/tests/maintenance.json.
 */
import { machineModel, MACHINE_TYPES, type TacheDef } from '@/domain/catalog';
import type { Alarme, Machine, PointDeMesure } from '@/domain/types';
import { DAY, H, historicValue, periodAt, type History } from '@/sim/history';
import { hashNoise, hashString } from '@/sim/random';

export type StatutTache = 'ok' | 'a_planifier' | 'en_retard';

export const STATUT_TACHE_LIBELLE: Record<StatutTache, string> = {
  ok: 'À jour',
  a_planifier: 'À planifier',
  en_retard: 'En retard',
};

/** Une tâche du plan sur une machine, avec son compteur et son échéance. */
export interface Echeance {
  id: string;
  machineId: string;
  tacheId: string;
  organeId: string;
  organeNom: string;
  tache: string;
  nature: TacheDef['nature'];
  /** Heures de marche ou jours depuis le dernier passage, ou valeur du point suivi. */
  compteur: number;
  /** Intervalle de la tâche, ou seuil d'alarme du point suivi. */
  seuil: number;
  seuilAttention?: number;
  unite: string;
  /** compteur / seuil */
  progression: number;
  statut: StatutTache;
  /** Date prévue de l'échéance (tendance du point ou rythme de marche de la machine). */
  echeance?: number;
  dernierPassage?: number;
  /** Durée d'intervention prévue (min). */
  duree: number;
  pointId?: string;
}

/** Une intervention consignée à la main dans le carnet (bon de travail clos). */
export interface Saisie {
  id: string;
  machineId: string;
  organeId?: string;
  type: TypeIntervention;
  date: number;
  /** min */
  duree: number;
  titre: string;
  compteRendu?: string;
  auteur: string;
  /** Tâche du plan réalisée : son compteur repart de zéro. */
  tacheId?: string;
}

export type TypeIntervention = 'curative' | 'preventive' | 'observation';

export const TYPE_INTERVENTION_LIBELLE: Record<TypeIntervention, string> = {
  curative: 'Curative',
  preventive: 'Préventive',
  observation: 'Observation',
};

export interface Intervention {
  id: string;
  machineId: string;
  organeId?: string;
  type: TypeIntervention;
  debut: number;
  fin?: number;
  titre: string;
  compteRendu?: string;
  cause?: string;
  auteur?: string;
  alarmeId?: string;
  code?: string;
  tacheId?: string;
  /** historique : base de données ; direct : alarme résolue pendant la session ; saisie : bon consigné à l'écran. */
  source: 'historique' | 'direct' | 'saisie';
}

export interface Prevision {
  machineId: string;
  pointId: string;
  organeId: string;
  organeNom: string;
  libelle: string;
  unite: string;
  /** Valeur actuelle d'après la tendance. */
  valeur: number;
  /** Variation par jour de marche. */
  pente: number;
  /** Coefficient de détermination de la tendance (0 à 1). */
  r2: number;
  seuil: number;
  niveau: 'attention' | 'alarme';
  /** Date probable du franchissement. */
  franchissement: number;
}

/** Horizon des prévisions et des échéances « à planifier ». */
export const HORIZON_JOURS = 30;
const A_PLANIFIER = 0.85;
const R2_MIN = 0.6;

const heuresMarche = (h: History, machineId: string, from: number, to: number) =>
  (h.periodes[machineId] ?? []).reduce((s, p) => (p.etat === 'marche' ? s + Math.max(0, Math.min(p.fin, to) - Math.max(p.debut, from)) : s), 0) / H;

/** Rythme de marche moyen de la machine (heures par jour calendaire), sur l'historique. */
export function heuresParJour(h: History, machineId: string): number {
  const jours = (h.fin - h.debut) / DAY;
  return jours > 0 ? heuresMarche(h, machineId, h.debut, h.fin) / jours : 0;
}

/** Passage de maintenance ramené à une heure ouvrée : 13 h, entre les deux équipes, jamais le dimanche. */
function heureOuvree(t: number, now: number): number {
  const d = new Date(t);
  d.setHours(13, 0, 0, 0);
  if (d.getDay() === 0) d.setDate(d.getDate() - 1);
  while (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

function statutPar(progression: number, echeance: number | undefined, now: number): StatutTache {
  if (progression >= 1) return 'en_retard';
  if (progression >= A_PLANIFIER || (echeance !== undefined && echeance - now < 7 * DAY)) return 'a_planifier';
  return 'ok';
}

/** Tendance linéaire d'un point pendant la marche (échantillon horaire sur l'historique) : pente par jour, R². */
export function tendance(h: History, machine: Machine, point: PointDeMesure, now: number): { pente: number; r2: number; valeur: number } | null {
  const model = machineModel(machine);
  const def = model.defs[point.organeId];
  const mdef = def?.mesures.find((x) => x.cle === point.cle);
  if (!mdef) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  const list = h.periodes[machine.id] ?? [];
  for (let t = h.debut + H / 2; t < now; t += H) {
    if (periodAt(list, t)?.etat !== 'marche') continue;
    xs.push((t - now) / DAY);
    ys.push(historicValue(h, machine, point, mdef, def.panne, t));
  }
  if (xs.length < 24) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (!sxx) return null;
  const pente = sxy / sxx;
  // x = 0 à l'instant présent : l'ordonnée à l'origine est la valeur actuelle selon la tendance.
  return { pente, r2: syy ? (sxy * sxy) / (sxx * syy) : 0, valeur: my - pente * mx };
}

/** Mesures horaires pendant la marche et droite de tendance prolongée jusqu'à `jusqua` (graphique d'une prévision). */
export function serieTendance(h: History, machine: Machine, point: PointDeMesure, now: number, jusqua: number): { t: number; v?: number; tendance?: number }[] {
  const model = machineModel(machine);
  const def = model.defs[point.organeId];
  const mdef = def?.mesures.find((x) => x.cle === point.cle);
  const tend = tendance(h, machine, point, now);
  if (!mdef || !tend) return [];
  const list = h.periodes[machine.id] ?? [];
  const out: { t: number; v?: number; tendance?: number }[] = [];
  for (let t = h.debut + H / 2; t <= jusqua; t += H) {
    const enMarche = t < now && periodAt(list, t)?.etat === 'marche';
    out.push({
      t,
      v: enMarche ? historicValue(h, machine, point, mdef, def.panne, t) : undefined,
      tendance: tend.valeur + (tend.pente * (t - now)) / DAY,
    });
  }
  return out;
}

/** Échéances du plan de maintenance d'une machine. */
export function echeances(h: History, machine: Machine, now: number, saisies: Saisie[] = []): Echeance[] {
  const type = MACHINE_TYPES[machine.type];
  if (!type) return [];
  const model = machineModel(machine);
  const hpj = heuresParJour(h, machine.id) || 10;
  return type.maintenance.map((t) => {
    const organe = model.organes.find((o) => o.numero === t.organe);
    const base = {
      id: `${machine.id}:${t.id}`,
      machineId: machine.id,
      tacheId: t.id,
      organeId: organe?.id ?? `${machine.id}.o${t.organe}`,
      organeNom: organe?.nom ?? `Organe ${t.organe}`,
      tache: t.tache,
      nature: t.nature,
      duree: t.duree,
    };
    if (t.nature === 'conditionnelle' && t.point) {
      const point = model.points.find((p) => p.organeId === base.organeId && p.cle === t.point);
      const seuil = point?.seuils.alarmeHaut ?? point?.seuils.alarmeBas ?? 0;
      const tend = point ? tendance(h, machine, point, now) : null;
      const valeur = tend?.valeur ?? point?.nominal ?? 0;
      const echeance = tend && tend.pente > 0 && seuil > valeur ? now + ((seuil - valeur) / tend.pente) * DAY : undefined;
      const progression = seuil ? valeur / seuil : 0;
      const attention = point?.seuils.attentionHaut;
      return {
        ...base,
        compteur: valeur,
        seuil,
        seuilAttention: attention,
        unite: point?.unite ?? '',
        progression,
        statut: valeur >= seuil ? 'en_retard' : (attention !== undefined && valeur >= attention) ? 'a_planifier' : statutPar(progression, echeance, now),
        echeance,
        pointId: point?.id,
      } satisfies Echeance;
    }
    // Systématique : dernier passage tiré de l'identifiant (stable d'une visite à l'autre), sauf saisie plus récente.
    const intervalle = t.intervalle ?? 1;
    const unite = t.unite ?? 'h';
    const fait = saisies.filter((s) => s.machineId === machine.id && s.tacheId === t.id && s.date <= now).sort((a, b) => b.date - a.date)[0];
    const consomme = (0.15 + hashNoise(hashString(base.id), 7) * 0.97) * intervalle;
    const dernierPassage = fait?.date ?? heureOuvree(now - (unite === 'j' ? consomme : consomme / hpj) * DAY, now);
    const compteur =
      unite === 'j' ? (now - dernierPassage) / DAY : dernierPassage >= h.debut ? heuresMarche(h, machine.id, dernierPassage, now) : fait ? 0 : consomme;
    const restant = intervalle - compteur;
    const echeance = now + (unite === 'j' ? restant : restant / hpj) * DAY;
    const progression = compteur / intervalle;
    return { ...base, compteur, seuil: intervalle, unite, progression, statut: statutPar(progression, echeance, now), echeance, dernierPassage } satisfies Echeance;
  });
}

/**
 * Dérives régulières (maintenance prévisionnelle) : un point dont la tendance sur l'historique est nette (R² ≥ 0,6)
 * et franchira son seuil d'attention dans l'horizon. Les compteurs d'usure et les mesures cycliques (bobines,
 * niveaux) sont suivis par le plan, pas ici.
 */
export function previsions(h: History, machine: Machine, now: number): Prevision[] {
  const model = machineModel(machine);
  const out: Prevision[] = [];
  for (const point of model.points) {
    const def = model.defs[point.organeId]?.mesures.find((m) => m.cle === point.cle);
    if (!def || def.dynamique || def.role || ['alarme', 'comptage', 'usure', 'vitesse'].includes(point.type)) continue;
    const tend = tendance(h, machine, point, now);
    if (!tend || tend.r2 < R2_MIN || !tend.pente) continue;
    const s = point.seuils;
    const cibles: [number | undefined, 'attention' | 'alarme'][] =
      tend.pente > 0 ? [[s.attentionHaut, 'attention'], [s.alarmeHaut, 'alarme']] : [[s.attentionBas, 'attention'], [s.alarmeBas, 'alarme']];
    for (const [seuil, niveau] of cibles) {
      if (seuil === undefined || (tend.pente > 0 ? tend.valeur >= seuil : tend.valeur <= seuil)) continue;
      const jours = (seuil - tend.valeur) / tend.pente;
      if (jours > HORIZON_JOURS) break;
      const organe = model.organes.find((o) => o.id === point.organeId);
      out.push({
        machineId: machine.id,
        pointId: point.id,
        organeId: point.organeId,
        organeNom: organe?.nom ?? '',
        libelle: point.libelle,
        unite: point.unite,
        valeur: tend.valeur,
        pente: tend.pente,
        r2: tend.r2,
        seuil,
        niveau,
        franchissement: now + jours * DAY,
      });
      break;
    }
  }
  return out;
}

/** Journal des interventions d'une ou plusieurs machines, du plus récent au plus ancien. */
export function journal(h: History, machines: Machine[], alarmesDirect: Alarme[], saisies: Saisie[], now: number): Intervention[] {
  const ids = new Set(machines.map((m) => m.id));
  const out: Intervention[] = [];
  const curative = (a: Alarme, source: Intervention['source']): Intervention => {
    const m = machines.find((x) => x.id === a.machineId);
    const panne = m ? machineModel(m).defs[a.organeId]?.panne : undefined;
    return {
      id: `iv-${a.id}`,
      machineId: a.machineId,
      organeId: a.organeId,
      type: 'curative',
      debut: a.horodatage,
      fin: a.finLe,
      titre: `${a.code} · ${a.message}`,
      compteRendu: panne?.action,
      cause: a.cause,
      auteur: source === 'historique' ? (a.acquitteePar ?? 'Maintenance') : 'Maintenance',
      alarmeId: a.id,
      code: a.code,
      source,
    };
  };
  for (const a of h.alarmes) if (ids.has(a.machineId) && a.gravite === 'critique' && a.finLe) out.push(curative(a, 'historique'));
  for (const a of alarmesDirect) {
    if (ids.has(a.machineId) && a.gravite === 'critique' && a.statut === 'resolue' && a.finLe && !a.id.startsWith('h-')) out.push(curative(a, 'direct'));
  }
  // Préventives du plan réalisées pendant la période couverte par l'historique.
  for (const m of machines) {
    for (const e of echeances(h, m, now, saisies)) {
      if (e.nature !== 'systematique' || e.dernierPassage === undefined || e.dernierPassage < h.debut) continue;
      if (saisies.some((s) => s.machineId === m.id && s.tacheId === e.tacheId && s.date === e.dernierPassage)) continue;
      out.push({
        id: `iv-${e.id}-${e.dernierPassage}`,
        machineId: m.id,
        organeId: e.organeId,
        type: 'preventive',
        debut: e.dernierPassage,
        fin: e.dernierPassage + e.duree * 60_000,
        titre: e.tache,
        compteRendu: 'Réalisée selon le plan de maintenance.',
        auteur: 'Maintenance',
        tacheId: e.tacheId,
        source: 'historique',
      });
    }
  }
  for (const s of saisies) {
    if (!ids.has(s.machineId)) continue;
    out.push({
      id: s.id,
      machineId: s.machineId,
      organeId: s.organeId,
      type: s.type,
      debut: s.date,
      fin: s.date + s.duree * 60_000,
      titre: s.titre,
      compteRendu: s.compteRendu,
      auteur: s.auteur,
      tacheId: s.tacheId,
      source: 'saisie',
    });
  }
  return out.sort((a, b) => b.debut - a.debut);
}

export interface IndicateursMaintenance {
  /** Temps moyen de bon fonctionnement entre deux pannes (ms). */
  mtbf?: number;
  /** Temps moyen de réparation (ms). */
  mttr?: number;
  /** Temps moyen d'acquittement (ms). */
  mtta?: number;
  pannes: number;
  curatives: number;
  preventives: number;
  /** Part du préventif dans le temps d'intervention. */
  partPreventive: number;
  heuresMarche: number;
}

export function indicateurs(h: History, machines: Machine[], interventions: Intervention[], alarmes: Alarme[], from: number, to: number): IndicateursMaintenance {
  const ids = new Set(machines.map((m) => m.id));
  const pannes = alarmes.filter((a) => ids.has(a.machineId) && a.gravite === 'critique' && a.horodatage >= from && a.horodatage < to);
  const marche = machines.reduce((s, m) => s + heuresMarche(h, m.id, from, to), 0);
  const resolues = pannes.filter((a) => a.finLe);
  const acquittees = pannes.filter((a) => a.acquitteeLe);
  const dans = interventions.filter((i) => i.debut >= from && i.debut < to);
  const duree = (i: Intervention) => (i.fin ?? i.debut) - i.debut;
  const tCur = dans.filter((i) => i.type === 'curative').reduce((s, i) => s + duree(i), 0);
  const tPrev = dans.filter((i) => i.type === 'preventive').reduce((s, i) => s + duree(i), 0);
  return {
    mtbf: pannes.length ? (marche * H) / pannes.length : undefined,
    mttr: resolues.length ? resolues.reduce((s, a) => s + (a.finLe! - a.horodatage), 0) / resolues.length : undefined,
    mtta: acquittees.length ? acquittees.reduce((s, a) => s + (a.acquitteeLe! - a.horodatage), 0) / acquittees.length : undefined,
    pannes: pannes.length,
    curatives: dans.filter((i) => i.type === 'curative').length,
    preventives: dans.filter((i) => i.type === 'preventive').length,
    partPreventive: tCur + tPrev ? tPrev / (tCur + tPrev) : 0,
    heuresMarche: marche,
  };
}
