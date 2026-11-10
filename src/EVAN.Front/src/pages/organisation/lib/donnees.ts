/**
 * Les chiffres de la vue d'ensemble, calculés une fois par usine à partir de ses 7 jours d'historique : ce que lisent
 * les cartes, les repères et les phrases de l'écran. Fonctions pures, sans React : l'écran les appelle sous useMemo.
 */
import type { Machine } from '@/domain/types';
import type { Usine } from '@/store/project';
import { geodesicMeasure } from '@/geo/geodesy';
import { getHistory, periodAt, type History } from '@/sim/history';
import { resumeExploitation, trsParJour, type ResumeExploitation } from '@/analytics/organisation';
import { echeances, previsions, type Saisie } from '@/analytics/maintenance';

/** Une couleur par usine, dans l'ordre de l'organisation (la couleur suit l'usine, pas son rang). */
export const COULEURS_USINES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

const H = 3_600_000;

/** Ce que font les machines d'une usine à un instant : en direct pour l'usine ouverte, sinon d'après l'historique. */
export interface EtatMachines {
  total: number;
  produisent: number;
  reglage: number;
  /** Numéros des machines en panne (R03…). */
  panne: string[];
  /** Numéros des machines qui tournent avec une mesure hors limite (direct seulement). */
  surveiller: string[];
}

export interface EntretienUrgent {
  tache: string;
  organe: string;
  numero: string;
}

export interface DeriveSuivie {
  libelle: string;
  organe: string;
  numero: string;
}

export interface Ligne {
  u: Usine;
  /** Nom complet du site : « Tours · ZI du Menneton ». */
  nom: string;
  /** Nom court, pour les phrases et les légendes : « Tours ». */
  court: string;
  couleur: string;
  surface: number;
  h: History;
  r: ResumeExploitation;
  /** Temps de panne par machine (ms), pour le plan. */
  heat: Record<string, number>;
  /** Entretiens en retard, saisies du carnet comprises (même compte que l'écran Maintenance). */
  retard: number;
  urgent?: EntretienUrgent;
  derive?: DeriveSuivie;
  jours: { t: number; trs: number }[];
  /** État des machines juste avant l'heure de fin de l'historique. */
  derniereHeure: EtatMachines;
  /** Heure de ce relevé (début de l'heure en cours). */
  heureReleve: number;
}

/** « Tours · ZI du Menneton » → « Tours ». */
export const nomCourt = (nom: string) => nom.split(' · ')[0];

/** Machines qui ont un historique (celles ajoutées pendant la session n'en ont pas encore). */
const avecHistorique = (machines: Machine[]) => machines.filter((m) => !m.creeLe);

/** État des machines à la fin de l'historique : la dernière période connue de chacune. */
export function etatHistorique(h: History, machines: Machine[]): EtatMachines {
  const etat: EtatMachines = { total: 0, produisent: 0, reglage: 0, panne: [], surveiller: [] };
  for (const m of avecHistorique(machines)) {
    const p = periodAt(h.periodes[m.id] ?? [], h.fin - 1);
    etat.total += 1;
    if (p?.etat === 'marche') etat.produisent += 1;
    else if (p?.etat === 'calage') etat.reglage += 1;
    else if (p?.etat === 'panne') etat.panne.push(m.numero);
  }
  return etat;
}

/** Entretiens en retard, le plus urgent en premier (le plus dépassé par rapport à son intervalle). */
function entretiens(h: History, machines: Machine[], now: number, saisies: Saisie[]) {
  const enRetard = avecHistorique(machines)
    .flatMap((m) => echeances(h, m, now, saisies).map((e) => ({ e, m })))
    .filter(({ e }) => e.statut === 'en_retard')
    .sort((a, b) => b.e.progression - a.e.progression);
  const premier = enRetard[0];
  return {
    retard: enRetard.length,
    urgent: premier ? { tache: premier.e.tache, organe: premier.e.organeNom, numero: premier.m.numero } : undefined,
  };
}

/** Première mesure qui glisse vers sa limite, la plus proche de la franchir. */
function premiereDerive(h: History, machines: Machine[], now: number): DeriveSuivie | undefined {
  const toutes = avecHistorique(machines)
    .flatMap((m) => previsions(h, m, now).map((p) => ({ p, m })))
    .sort((a, b) => a.p.franchissement - b.p.franchissement);
  const d = toutes[0];
  return d ? { libelle: d.p.libelle, organe: d.p.organeNom, numero: d.m.numero } : undefined;
}

/** Une ligne par usine en service : tout ce que l'écran affiche d'elle, calculé une fois. */
export function construireLignes(usines: Usine[], now: number, saisies: Saisie[]): Ligne[] {
  return usines.map((u, i) => {
    const h = getHistory(u.machines, now);
    const heat: Record<string, number> = {};
    for (const m of u.machines) heat[m.id] = (h.periodes[m.id] ?? []).reduce((s, p) => (p.etat === 'panne' ? s + (p.fin - p.debut) : s), 0);
    const nom = u.site?.nom ?? 'Usine';
    return {
      u,
      nom,
      court: nomCourt(nom),
      couleur: COULEURS_USINES[i % COULEURS_USINES.length],
      surface: u.batiments.reduce((s, b) => s + geodesicMeasure(b.contour).area, 0),
      h,
      r: resumeExploitation(u.machines, now, h),
      heat,
      ...entretiens(h, u.machines, now, saisies),
      derive: premiereDerive(h, u.machines, now),
      jours: trsParJour(h, u.machines),
      derniereHeure: etatHistorique(h, u.machines),
      heureReleve: h.fin,
    };
  });
}

export interface Totaux {
  machines: number;
  surface: number;
  panneH: number;
  pannes: number;
  kwh: number;
  co2: number;
  retard: number;
  derives: number;
  /** Efficacité (TRS) et disponibilité de l'organisation, pondérées par le nombre de machines de chaque usine. */
  trs: number;
  disponibilite: number;
  /** Temps moyen de réparation de l'organisation (ms), pondéré par le nombre de pannes de chaque usine. */
  mttr?: number;
}

export function totaux(lignes: Ligne[]): Totaux {
  const machines = lignes.reduce((s, l) => s + l.u.machines.length, 0);
  const pondere = (f: (r: ResumeExploitation) => number) => (machines ? lignes.reduce((s, l) => s + f(l.r) * l.u.machines.length, 0) / machines : 0);
  const avecMttr = lignes.filter((l) => l.r.mttr !== undefined && l.r.alarmes > 0);
  const pannesMttr = avecMttr.reduce((s, l) => s + l.r.alarmes, 0);
  return {
    machines,
    surface: lignes.reduce((s, l) => s + l.surface, 0),
    panneH: lignes.reduce((s, l) => s + l.r.panneH, 0),
    pannes: lignes.reduce((s, l) => s + l.r.alarmes, 0),
    kwh: lignes.reduce((s, l) => s + l.r.energie.total.total, 0),
    co2: lignes.reduce((s, l) => s + l.r.energie.total.co2, 0),
    retard: lignes.reduce((s, l) => s + l.retard, 0),
    derives: lignes.reduce((s, l) => s + l.r.previsions, 0),
    trs: pondere((r) => r.trs),
    disponibilite: pondere((r) => r.disponibilite),
    mttr: pannesMttr ? avecMttr.reduce((s, l) => s + l.r.mttr! * l.r.alarmes, 0) / pannesMttr : undefined,
  };
}

export interface ArretLong {
  id: string;
  /** Ce qui s'est passé, en clair (message de l'alarme). */
  message: string;
  numero: string;
  machineNom: string;
  court: string;
  couleur: string;
  /** Heures d'arrêt cumulées sur la période. */
  heures: number;
  fois: number;
}

/** Les pannes qui ont coûté le plus de temps, toutes usines : durée cumulée par alarme et par machine. */
export function arretsLesPlusLongs(lignes: Ligne[], n = 8): ArretLong[] {
  const out: ArretLong[] = [];
  for (const l of lignes) {
    const parCle = new Map<string, { message: string; machineId: string; ms: number; fois: number }>();
    for (const a of l.h.alarmes) {
      if (!a.finLe) continue;
      const cle = `${a.code}|${a.machineId}`;
      const cur = parCle.get(cle) ?? { message: a.message, machineId: a.machineId, ms: 0, fois: 0 };
      parCle.set(cle, { ...cur, ms: cur.ms + (a.finLe - a.horodatage), fois: cur.fois + 1 });
    }
    for (const [cle, v] of parCle) {
      const m = l.u.machines.find((x) => x.id === v.machineId);
      out.push({
        id: `${l.u.id}|${cle}`,
        message: v.message,
        numero: m?.numero ?? '',
        machineNom: m?.nom ?? '',
        court: l.court,
        couleur: l.couleur,
        heures: v.ms / H,
        fois: v.fois,
      });
    }
  }
  return out.sort((a, b) => b.heures - a.heures).slice(0, n);
}

/** La machine la plus touchée par les pannes sur le plan d'une usine. */
export function machineLaPlusTouchee(l: Ligne): { numero: string; heures: number } | undefined {
  let best: { numero: string; heures: number } | undefined;
  for (const m of l.u.machines) {
    const heures = (l.heat[m.id] ?? 0) / H;
    if (heures > 0 && (!best || heures > best.heures)) best = { numero: m.numero, heures };
  }
  return best;
}
