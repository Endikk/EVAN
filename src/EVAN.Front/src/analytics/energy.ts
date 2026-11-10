/**
 * Énergie et CO₂ : la puissance appelée dépend de l'état de chaque machine (production, calage, panne sous tension,
 * veille hors production). En intégrant les périodes d'état, on obtient les kWh par état, par jour et par machine,
 * la courbe de charge de l'usine, son pic, et l'intensité énergétique (kWh pour 1 000 unités bonnes, l'indicateur de
 * performance énergétique de l'ISO 50001).
 *
 * Même logique que src/EVAN.Core/Domain/Energy ; cas de test communs : data/tests/energie.json.
 */
import { ENERGIE_DEFAUT, MACHINE_TYPES, PAS_ETIQUETTE_M, profilEnergie, type ParametresEnergie } from '@/domain/catalog';
import type { EtatMachine, Machine } from '@/domain/types';
import { DAY, MIN, periodIndex, type EtatPeriode, type History } from '@/sim/history';

export type EtatEnergie = EtatPeriode;

/** Ordre d'empilement : ce qui produit, puis ce qui se perd (ordre choisi pour que deux couleurs proches ne se touchent pas). */
export const ETATS_ENERGIE: EtatEnergie[] = ['marche', 'calage', 'arret', 'panne'];

export const ETAT_ENERGIE_LIBELLE: Record<EtatEnergie, string> = {
  marche: 'Production',
  calage: 'Calage',
  panne: 'Panne, machine sous tension',
  arret: 'Veille hors production',
};

export type Parametres = Pick<ParametresEnergie, 'facteurCo2' | 'prixKwh'>;

/** Puissance appelée (kW) par une machine de ce type dans cet état ; « attention » est une marche sous surveillance. */
export function puissance(type: string, etat: EtatMachine): number {
  const p = profilEnergie(type);
  return etat === 'attention' ? p.marche : p[etat];
}

/** Puissance appelée par l'usine maintenant, d'après l'état temps réel de chaque machine. */
export function puissanceUsine(machines: Machine[], etats: Record<string, { etat: EtatMachine } | undefined>): number {
  return machines.reduce((s, m) => s + puissance(m.type, etats[m.id]?.etat ?? 'arret'), 0);
}

/** Unité produite par un type de machine, et cadence en unités par minute à une vitesse donnée. */
export function uniteProduction(type: string): { unite: string; parMinute(vitesse: number): number } {
  const u = MACHINE_TYPES[type]?.vitesse.unite;
  switch (u) {
    case 'm/min':
      return { unite: 'étiquettes', parMinute: (v) => v / PAS_ETIQUETTE_M };
    case 'feuilles/min':
      return { unite: 'feuilles', parMinute: (v) => v };
    case 'plaques/h':
      return { unite: 'plaques', parMinute: (v) => v / 60 };
    case 'étiq./h':
      return { unite: 'étiquettes', parMinute: (v) => v / 60 };
    default:
      return { unite: 'unités', parMinute: (v) => v };
  }
}

export type KwhParEtat = Record<EtatEnergie, number>;

const vide = (): KwhParEtat => ({ marche: 0, calage: 0, panne: 0, arret: 0 });

export interface BilanEnergie {
  kwh: KwhParEtat;
  total: number;
  /** Unités bonnes produites sur la période (vitesse nominale × performance × qualité du jour). */
  production: number;
  unite: string;
  /** kWh pour 1 000 unités bonnes. */
  intensite?: number;
  /** kgCO₂e */
  co2: number;
  /** € */
  cout: number;
}

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

export function bilanMachine(h: History, machine: Machine, from: number, to: number, params: Parametres = ENERGIE_DEFAUT): BilanEnergie {
  const kwh = vide();
  const p = profilEnergie(machine.type);
  const { unite, parMinute } = uniteProduction(machine.type);
  const nominale = MACHINE_TYPES[machine.type]?.vitesse.nominale ?? 0;
  const jours = h.trs[machine.id] ?? [];
  let production = 0;
  for (const q of h.periodes[machine.id] ?? []) {
    const d = overlap(q.debut, q.fin, from, to);
    if (!d) continue;
    kwh[q.etat] += (d / 3_600_000) * p[q.etat];
    if (q.etat === 'marche') {
      const j = jours.find((x) => q.debut >= x.jour && q.debut < x.jour + DAY);
      production += (d / MIN) * parMinute(nominale) * (j?.performance || 0.88) * (j?.qualite || 0.97);
    }
  }
  return finir(kwh, production, unite, params);
}

function finir(kwh: KwhParEtat, production: number, unite: string, params: Parametres): BilanEnergie {
  const total = kwh.marche + kwh.calage + kwh.panne + kwh.arret;
  return {
    kwh,
    total,
    production,
    unite,
    intensite: production > 0 ? (total / production) * 1000 : undefined,
    co2: total * params.facteurCo2,
    cout: total * params.prixKwh,
  };
}

export interface BilanUsine {
  total: BilanEnergie;
  parMachine: { machine: Machine; bilan: BilanEnergie }[];
  /** Part de l'énergie consommée hors production (calage, panne, veille). */
  horsProduction: number;
}

/**
 * Bilan d'une usine : somme des machines. L'intensité de l'usine rapporte toute son énergie (prépresse et façonnage
 * compris) aux étiquettes imprimées : la refendeuse retravaille les mêmes étiquettes, les compter deux fois
 * flatterait l'indicateur.
 */
export function bilanUsine(h: History, machines: Machine[], from: number, to: number, params: Parametres = ENERGIE_DEFAUT): BilanUsine {
  const parMachine = machines.filter((m) => h.periodes[m.id]).map((machine) => ({ machine, bilan: bilanMachine(h, machine, from, to, params) }));
  const kwh = vide();
  let imprimees = 0;
  for (const { machine, bilan } of parMachine) {
    for (const e of ETATS_ENERGIE) kwh[e] += bilan.kwh[e];
    if (MACHINE_TYPES[machine.type]?.categorie === 'impression') imprimees += bilan.production;
  }
  const total = finir(kwh, imprimees, 'étiquettes imprimées', params);
  return { total, parMachine, horsProduction: total.total ? (kwh.calage + kwh.panne + kwh.arret) / total.total : 0 };
}

/** kWh par jour et par état, de minuit à minuit (heure locale). */
export function energieParJour(h: History, machines: Machine[], from: number, to: number): { jour: number; kwh: KwhParEtat; total: number }[] {
  const out: { jour: number; kwh: KwhParEtat; total: number }[] = [];
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  for (let jour = d.getTime(); jour < to; ) {
    const next = new Date(jour);
    next.setDate(next.getDate() + 1);
    const fin = next.getTime();
    const kwh = vide();
    for (const m of machines) {
      const p = profilEnergie(m.type);
      for (const q of h.periodes[m.id] ?? []) {
        const o = overlap(q.debut, q.fin, Math.max(jour, from), Math.min(fin, to));
        if (o) kwh[q.etat] += (o / 3_600_000) * p[q.etat];
      }
    }
    out.push({ jour, kwh, total: kwh.marche + kwh.calage + kwh.panne + kwh.arret });
    jour = fin;
  }
  return out;
}

/** Courbe de charge : puissance moyenne appelée par l'usine sur chaque intervalle (kW). */
export function courbeDeCharge(h: History, machines: Machine[], from: number, to: number, pas = 10 * MIN): { t: number; kw: number }[] {
  const out: { t: number; kw: number }[] = [];
  for (let t = from; t < to; t += pas) {
    const t1 = Math.min(t + pas, to);
    let kwh = 0;
    for (const m of machines) {
      const p = profilEnergie(m.type);
      const list = h.periodes[m.id] ?? [];
      // Les périodes sont triées : on part de celle qui couvre t.
      let i = periodIndex(list, t);
      if (i < 0) continue;
      for (; i < list.length && list[i].debut < t1; i++) kwh += (overlap(list[i].debut, list[i].fin, t, t1) / 3_600_000) * p[list[i].etat];
    }
    out.push({ t, kw: kwh / ((t1 - t) / 3_600_000) });
  }
  return out;
}

/** Coût annuel de la veille si la semaine observée se répète (52 semaines). */
export function coutAnnuelVeille(bilan: BilanEnergie, joursObserves: number, params: Parametres = ENERGIE_DEFAUT): number {
  return joursObserves > 0 ? (bilan.kwh.arret / joursObserves) * 365 * params.prixKwh : 0;
}

export type Gisement =
  | { id: 'veille' | 'calage' | 'panne'; kwhAn: number; euroAn: number; part: number }
  | { id: 'machine'; kwhAn: number; euroAn: number; part: number; machineId: string; type: string; ecart: number; intensite: number; moyenne: number };

/**
 * Gisements d'économie, ramenés à l'année si la période observée se répète : énergie hors production (veille, calage,
 * pannes sous tension) et machine plus gourmande par étiquette que ses semblables (même type, au moins deux machines).
 */
export function gisements(b: BilanUsine, joursObserves: number, params: Parametres = ENERGIE_DEFAUT): Gisement[] {
  if (!(joursObserves > 0) || !b.total.total) return [];
  const an = (kwh: number) => (kwh / joursObserves) * 365;
  const out: Gisement[] = (['arret', 'calage', 'panne'] as const).map((e) => ({
    id: e === 'arret' ? 'veille' : e,
    kwhAn: an(b.total.kwh[e]),
    euroAn: an(b.total.kwh[e]) * params.prixKwh,
    part: b.total.kwh[e] / b.total.total,
  }));
  const parType = new Map<string, { machine: Machine; bilan: BilanEnergie }[]>();
  for (const x of b.parMachine) if (x.bilan.intensite !== undefined) parType.set(x.machine.type, [...(parType.get(x.machine.type) ?? []), x]);
  for (const [type, list] of parType) {
    if (list.length < 2) continue;
    const moyenne = list.reduce((s, x) => s + x.bilan.total, 0) / (list.reduce((s, x) => s + x.bilan.production, 0) / 1000);
    const pire = list.reduce((a, x) => (x.bilan.intensite! > a.bilan.intensite! ? x : a));
    const ecart = pire.bilan.intensite! / moyenne - 1;
    if (ecart < 0.03) continue;
    const kwh = ((pire.bilan.intensite! - moyenne) * pire.bilan.production) / 1000;
    out.push({ id: 'machine', kwhAn: an(kwh), euroAn: an(kwh) * params.prixKwh, part: kwh / b.total.total, machineId: pire.machine.id, type, ecart, intensite: pire.bilan.intensite!, moyenne });
  }
  return out.sort((a, b2) => b2.euroAn - a.euroAn);
}
