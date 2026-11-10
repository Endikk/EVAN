/**
 * Vue d'ensemble d'une organisation : les indicateurs d'exploitation de chaque usine, calculés de la même façon
 * pour toutes, pour les comparer (TRS, disponibilité, pannes, maintenance, énergie) et repérer les écarts entre
 * machines de même type d'une usine à l'autre.
 */
import { MACHINE_TYPES } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { getHistory, type History } from '@/sim/history';
import { bilanUsine, type BilanUsine } from './energy';
import { echeances, previsions } from './maintenance';

const H = 3_600_000;

export interface ResumeExploitation {
  /** TRS pondéré par le temps d'ouverture, sur 7 jours. */
  trs: number;
  disponibilite: number;
  /** Heures d'arrêt sur panne. */
  panneH: number;
  alarmes: number;
  /** Temps moyen de réparation (ms). */
  mttr?: number;
  energie: BilanUsine;
  retard: number;
  aPlanifier: number;
  previsions: number;
}

export function resumeExploitation(machines: Machine[], now: number, h: History = getHistory(machines, now)): ResumeExploitation {
  const avec = machines.filter((m) => !m.creeLe);
  let num = 0;
  let den = 0;
  let marche = 0;
  for (const m of avec) {
    for (const j of h.trs[m.id] ?? []) {
      num += j.trs * j.ouvertureMin;
      den += j.ouvertureMin;
      marche += j.marcheMin;
    }
  }
  const panne = avec.reduce((s, m) => s + (h.periodes[m.id] ?? []).reduce((x, p) => (p.etat === 'panne' ? x + (p.fin - p.debut) : x), 0), 0);
  const resolues = h.alarmes.filter((a) => a.finLe);
  const ech = avec.flatMap((m) => echeances(h, m, now));
  return {
    trs: den ? num / den : 0,
    disponibilite: den ? marche / den : 0,
    panneH: panne / H,
    alarmes: h.alarmes.length,
    mttr: resolues.length ? resolues.reduce((s, a) => s + (a.finLe! - a.horodatage), 0) / resolues.length : undefined,
    energie: bilanUsine(h, avec, h.debut, now),
    retard: ech.filter((e) => e.statut === 'en_retard').length,
    aPlanifier: ech.filter((e) => e.statut === 'a_planifier').length,
    previsions: avec.reduce((s, m) => s + previsions(h, m, now).length, 0),
  };
}

/** TRS de l'usine jour par jour (moyenne pondérée par l'ouverture). */
export function trsParJour(h: History, machines: Machine[]): { t: number; trs: number }[] {
  const jours = new Map<number, { n: number; d: number }>();
  for (const m of machines) {
    for (const j of h.trs[m.id] ?? []) {
      if (!j.ouvertureMin) continue;
      const cur = jours.get(j.jour) ?? { n: 0, d: 0 };
      jours.set(j.jour, { n: cur.n + j.trs * j.ouvertureMin, d: cur.d + j.ouvertureMin });
    }
  }
  return [...jours.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, trs: v.n / v.d }));
}

export interface ComparaisonType {
  type: string;
  libelle: string;
  /** Par usine : nombre de machines, TRS, intensité énergétique (kWh / 1 000 unités). */
  usines: Record<string, { machines: number; trs: number; intensite?: number; unite?: string } | undefined>;
}

/** Machines de même type d'une usine à l'autre : TRS et intensité énergétique. */
export function comparerTypes(usines: { id: string; machines: Machine[]; h: History; energie: BilanUsine }[]): ComparaisonType[] {
  const types = [...new Set(usines.flatMap((u) => u.machines.filter((m) => !m.creeLe).map((m) => m.type)))].filter((t) => MACHINE_TYPES[t]);
  return types
    .map((type) => ({
      type,
      libelle: MACHINE_TYPES[type].libelle,
      usines: Object.fromEntries(
        usines.map((u) => {
          const ms = u.machines.filter((m) => m.type === type && !m.creeLe);
          if (!ms.length) return [u.id, undefined];
          let num = 0;
          let den = 0;
          for (const m of ms) for (const j of u.h.trs[m.id] ?? []) (num += j.trs * j.ouvertureMin), (den += j.ouvertureMin);
          const bilans = u.energie.parMachine.filter((x) => x.machine.type === type);
          const kwh = bilans.reduce((s, x) => s + x.bilan.total, 0);
          const prod = bilans.reduce((s, x) => s + x.bilan.production, 0);
          return [u.id, { machines: ms.length, trs: den ? num / den : 0, intensite: prod ? (kwh / prod) * 1000 : undefined, unite: bilans[0]?.bilan.unite }];
        }),
      ),
    }))
    .sort((a, b) => Object.values(b.usines).filter(Boolean).length - Object.values(a.usines).filter(Boolean).length);
}
