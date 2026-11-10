/**
 * Lecture de la courbe de charge : à chaque tranche, la puissance totale et celle des machines qui travaillent
 * (production ou réglage). Une suite de tranches où rien ne travaille est un creux : la nuit ou le week-end. Ce que
 * l'usine tire encore pendant ces creux, c'est sa veille, l'énergie dépensée sans rien produire.
 */
import { profilEnergie } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { periodIndex, type History } from '@/sim/history';

const H = 3_600_000;
const DAY = 24 * H;

export interface PointCharge {
  t: number;
  /** Puissance moyenne appelée par l'usine sur la tranche (kW). */
  kw: number;
  /** Part de cette puissance tirée par des machines en production ou en réglage (kW). */
  kwActif: number;
}

export interface Creux {
  debut: number;
  fin: number;
  /** Énergie consommée pendant le creux (kWh). */
  kwh: number;
  nature: 'nuit' | 'week-end';
}

export interface LectureCourbe {
  pic?: { t: number; kw: number };
  creux: Creux[];
  /** Puissance moyenne tirée pendant les creux (kW) : le talon de veille. */
  talon?: number;
  kwhCreux: number;
  nuits: boolean;
  weekEnd: boolean;
}

/**
 * Un creux plus court ne dit rien de la nuit ou du week-end (une pause entre deux séries, par exemple). Au bord de la
 * fenêtre, le creux est coupé par la période choisie : une heure suffit alors (la nuit qui commence, par exemple).
 */
const CREUX_MIN = 3 * H;
const CREUX_MIN_BORD = H;

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

/** Courbe de charge par tranche de `pas` ms, en séparant ce qui travaille du reste. */
export function courbeParActivite(h: History, machines: Machine[], from: number, to: number, pas: number): PointCharge[] {
  const out: PointCharge[] = [];
  for (let t = from; t < to; t += pas) {
    const t1 = Math.min(t + pas, to);
    let kwhTotal = 0;
    let kwhActif = 0;
    for (const m of machines) {
      const p = profilEnergie(m.type);
      const list = h.periodes[m.id] ?? [];
      // Les périodes sont triées : on part de celle qui couvre t.
      let i = periodIndex(list, t);
      if (i < 0) continue;
      for (; i < list.length && list[i].debut < t1; i++) {
        const e = (overlap(list[i].debut, list[i].fin, t, t1) / H) * p[list[i].etat];
        kwhTotal += e;
        if (list[i].etat === 'marche' || list[i].etat === 'calage') kwhActif += e;
      }
    }
    const heures = (t1 - t) / H;
    out.push({ t, kw: kwhTotal / heures, kwActif: kwhActif / heures });
  }
  return out;
}

/** Un creux qui touche un dimanche, ou qui dure plus d'une journée de travail, est un week-end ; sinon une nuit. */
function natureCreux(debut: number, fin: number): Creux['nature'] {
  if (fin - debut >= 20 * H) return 'week-end';
  for (let t = debut; t < fin; t += H) if (new Date(t).getDay() === 0) return 'week-end';
  return 'nuit';
}

/** Repère les creux et en tire le pic, le talon de veille et l'énergie consommée sans rien produire. */
export function lireCourbe(points: PointCharge[], pas: number): LectureCourbe {
  const creux: Creux[] = [];
  let pic: LectureCourbe['pic'];
  let debut: number | undefined;
  let kwh = 0;
  const premier = points[0]?.t;
  const dernier = points.length ? points[points.length - 1].t + pas : undefined;
  const fermer = (fin: number) => {
    const auBord = debut === premier || fin === dernier;
    if (debut !== undefined && fin - debut >= (auBord ? CREUX_MIN_BORD : CREUX_MIN)) creux.push({ debut, fin, kwh, nature: natureCreux(debut, fin) });
    debut = undefined;
    kwh = 0;
  };
  for (const p of points) {
    if (!pic || p.kw > pic.kw) pic = { t: p.t, kw: p.kw };
    if (p.kwActif > 1e-6 || p.kw <= 0) {
      fermer(p.t);
      continue;
    }
    debut ??= p.t;
    kwh += (p.kw * pas) / H;
  }
  if (dernier !== undefined) fermer(dernier);
  const kwhCreux = creux.reduce((s, c) => s + c.kwh, 0);
  const heures = creux.reduce((s, c) => s + (c.fin - c.debut), 0) / H;
  return {
    pic: pic && pic.kw > 0 ? pic : undefined,
    creux,
    talon: heures > 0 ? kwhCreux / heures : undefined,
    kwhCreux,
    nuits: creux.some((c) => c.nature === 'nuit'),
    weekEnd: creux.some((c) => c.nature === 'week-end'),
  };
}

/** Graduations de l'axe du temps : chaque minuit sur plusieurs jours, toutes les 3 heures sur une journée. */
export function graduations(from: number, to: number): number[] {
  const out: number[] = [];
  if (to - from > 2 * DAY) {
    const d = new Date(from);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < from) d.setDate(d.getDate() + 1);
    for (; d.getTime() < to; d.setDate(d.getDate() + 1)) out.push(d.getTime());
    return out;
  }
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(Math.ceil(d.getHours() / 3) * 3);
  for (let t = d.getTime(); t < to; t += 3 * H) if (t >= from) out.push(t);
  return out;
}
