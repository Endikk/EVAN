/**
 * Chronologie d'une panne, pour la revoir : images successives de la machine (état, vitesse, mesures de l'organe en
 * cause) et étapes clés, de la dérive au redémarrage. Équivalent des « event frames » des historiens industriels :
 * l'alarme ouvre une fenêtre de temps, on y rejoue les mesures et les actions.
 *
 * Même logique que src/EVAN.Core/Domain/Maintenance/Timeline.cs (outil MCP « chronologie_panne »).
 */
import { machineModel } from '@/domain/catalog';
import type { Alarme, EtatMachine, Machine, Organe, PointDeMesure } from '@/domain/types';
import { classify } from '@/sim/rules';
import { GLISSEMENT, MIN, historicValue, periodAt, seuilDePanne, type History } from '@/sim/history';

export type EtapeChronologie = 'derive' | 'attention' | 'alarme' | 'acquittement' | 'reparation' | 'redemarrage' | 'production';

export interface EvenementChronologie {
  t: number;
  etape: EtapeChronologie;
  /** Valeur de la mesure en cause à cet instant, et seuil franchi le cas échéant. */
  valeur?: number;
  seuil?: number;
}

export interface ImageChronologie {
  t: number;
  etat: EtatMachine;
  /** Vitesse rapportée à la nominale (anime les rouleaux). */
  facteur: number;
  valeurs: Record<string, number>;
}

export interface Chronologie {
  alarme: Alarme;
  machine: Machine;
  organe?: Organe;
  /** Mesure en cause (celle dont le seuil a déclenché l'alarme). */
  point?: PointDeMesure;
  /** Mesures de l'organe, rejouées avec elle. */
  points: PointDeMesure[];
  debut: number;
  fin: number;
  pas: number;
  images: ImageChronologie[];
  evenements: EvenementChronologie[];
}

const AVANT = 10 * MIN;
const APRES = 5 * MIN;
const IMAGES_MAX = 720;

/** Chronologie d'une panne de l'historique ; null si la machine n'a pas d'historique à cette date. */
export function chronologie(h: History, machine: Machine, alarme: Alarme): Chronologie | null {
  const list = h.periodes[machine.id];
  if (!list?.length) return null;
  const model = machineModel(machine);
  const def = model.defs[alarme.organeId];
  const organe = model.organes.find((o) => o.id === alarme.organeId);
  const points = model.points.filter((p) => p.organeId === alarme.organeId && p.type !== 'alarme');
  const point = model.points.find((p) => p.id === alarme.pointId) ?? points.find((p) => p.cle === def?.panne?.mesure);
  const fin0 = alarme.finLe ?? alarme.horodatage + 10 * MIN;
  // On rejoue jusqu'au retour en production (calage de reprise ou nouveau travail), dans la limite d'une demi-heure.
  const reprise = alarme.finLe !== undefined ? list.find((q) => q.debut >= alarme.finLe! && q.etat === 'marche')?.debut : undefined;
  const fin = Math.min(h.fin, Math.max(fin0 + APRES, reprise !== undefined ? Math.min(reprise + MIN, fin0 + 30 * MIN) : 0));
  // Cinq secondes par image au moins, IMAGES_MAX images au plus : une longue panne se rejoue en accéléré.
  const pas = Math.max(5_000, Math.ceil((fin - alarme.horodatage + AVANT) / IMAGES_MAX / 1000) * 1000);
  // La fenêtre démarre un nombre entier de pas avant l'alarme : une image tombe pile à l'instant de l'alarme.
  const debut = alarme.horodatage - Math.ceil(AVANT / pas) * pas;

  const valeur = (p: PointDeMesure, t: number) => {
    const md = def?.mesures.find((m) => m.cle === p.cle);
    return md ? historicValue(h, machine, p, md, def?.panne, t) : p.nominal;
  };

  const images: ImageChronologie[] = [];
  for (let t = debut; t <= fin; t += pas) {
    const q = periodAt(list, t);
    let etat: EtatMachine = q?.etat ?? 'arret';
    const valeurs = Object.fromEntries(points.map((p) => [p.id, valeur(p, t)]));
    if (etat === 'marche' && point && classify(valeurs[point.id], point.seuils) !== 'ok') etat = 'attention';
    images.push({ t, etat, facteur: etat === 'marche' || etat === 'attention' ? 0.92 : etat === 'calage' ? 0.18 : 0, valeurs });
  }

  const evenements: EvenementChronologie[] = [];
  const panne = def?.panne;
  if (point && panne && panne.forme !== 'saut') {
    const t0 = alarme.horodatage - GLISSEMENT;
    evenements.push({ t: t0, etape: 'derive', valeur: valeur(point, t0) });
    // Premier franchissement du seuil d'attention, cherché à la seconde près pendant le glissement.
    const s = point.seuils;
    const seuilAttention = panne.cible >= point.nominal ? s.attentionHaut : s.attentionBas;
    for (let t = t0; t < alarme.horodatage; t += 1000) {
      const v = valeur(point, t);
      if (classify(v, s) !== 'ok') {
        evenements.push({ t, etape: 'attention', valeur: v, seuil: seuilAttention });
        break;
      }
    }
  }
  evenements.push({
    t: alarme.horodatage,
    etape: 'alarme',
    valeur: alarme.valeur,
    seuil: point && panne ? seuilDePanne(panne, point.seuils, point.nominal) : alarme.seuil,
  });
  if (alarme.acquitteeLe) evenements.push({ t: alarme.acquitteeLe, etape: 'acquittement' });
  if (alarme.finLe) {
    evenements.push({ t: alarme.finLe, etape: 'reparation' });
    // Redémarrage : la machine repart (calage de reprise) ; production : elle retrouve sa cadence.
    const apres = list.filter((q) => q.debut >= alarme.finLe! && q.debut <= fin);
    const reprise = apres.find((q) => q.etat === 'calage' || q.etat === 'marche');
    if (reprise) evenements.push({ t: reprise.debut, etape: 'redemarrage' });
    const production = apres.find((q) => q.etat === 'marche');
    if (production && production !== reprise) evenements.push({ t: production.debut, etape: 'production' });
  }
  evenements.sort((a, b) => a.t - b.t);
  return { alarme, machine, organe, point, points, debut, fin, pas, images, evenements };
}

/** Image affichée à l'instant t (la dernière dont l'heure est passée). */
export function imageA(c: Chronologie, t: number): ImageChronologie {
  const i = Math.min(c.images.length - 1, Math.max(0, Math.floor((t - c.debut) / c.pas)));
  return c.images[i];
}

/** Séries temps réel d'un point (tampon de la session, une mesure par seconde). */
export type SerieDirect = (pointId: string) => { t: number[]; v: number[] };

/**
 * Chronologie d'une panne survenue pendant la session : rejouée depuis le tampon des mesures temps réel (les quinze
 * dernières minutes). Null si le tampon ne couvre plus l'alarme.
 */
export function chronologieDirect(machine: Machine, alarme: Alarme, serie: SerieDirect, now = Date.now()): Chronologie | null {
  const model = machineModel(machine);
  const def = model.defs[alarme.organeId];
  const organe = model.organes.find((o) => o.id === alarme.organeId);
  const points = model.points.filter((p) => p.organeId === alarme.organeId && p.type !== 'alarme');
  const point = model.points.find((p) => p.id === alarme.pointId) ?? points.find((p) => p.cle === def?.panne?.mesure);
  const principal = point ? serie(point.id) : undefined;
  if (!principal?.t.length || principal.t[0] > alarme.horodatage) return null;
  const debut = Math.max(principal.t[0], alarme.horodatage - AVANT);
  const fin = Math.min(now, principal.t[principal.t.length - 1], (alarme.finLe ?? now) + APRES);
  const pas = Math.max(1000, Math.ceil((fin - debut) / IMAGES_MAX / 1000) * 1000);
  // Valeur la plus récente à l'instant t dans un tampon trié.
  const at = (s: { t: number[]; v: number[] }, t: number) => {
    let lo = 0;
    let hi = s.t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (s.t[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return s.v[lo];
  };
  const series = Object.fromEntries(points.map((p) => [p.id, serie(p.id)]));
  const images: ImageChronologie[] = [];
  const reprise = alarme.finLe !== undefined ? alarme.finLe + 6_000 : undefined;
  for (let t = debut; t <= fin; t += pas) {
    const valeurs = Object.fromEntries(points.filter((p) => series[p.id].t.length).map((p) => [p.id, at(series[p.id], t)]));
    let etat: EtatMachine =
      t >= alarme.horodatage && (alarme.finLe === undefined || t < alarme.finLe) ? 'panne' : reprise !== undefined && t >= alarme.finLe! && t < reprise ? 'calage' : 'marche';
    if (etat === 'marche' && point && valeurs[point.id] !== undefined && classify(valeurs[point.id], point.seuils) !== 'ok') etat = 'attention';
    images.push({ t, etat, facteur: etat === 'marche' || etat === 'attention' ? 0.92 : etat === 'calage' ? 0.18 : 0, valeurs });
  }
  const evenements: EvenementChronologie[] = [];
  if (point) {
    const s = point.seuils;
    for (let i = 0; i < principal.t.length && principal.t[i] < alarme.horodatage; i++) {
      const v = principal.v[i];
      if (principal.t[i] >= debut && classify(v, s) !== 'ok') {
        const seuil = s.attentionHaut !== undefined && v >= s.attentionHaut ? s.attentionHaut : s.attentionBas;
        evenements.push({ t: principal.t[i], etape: 'attention', valeur: v, seuil });
        break;
      }
    }
  }
  evenements.push({ t: alarme.horodatage, etape: 'alarme', valeur: alarme.valeur, seuil: alarme.seuil });
  if (alarme.acquitteeLe) evenements.push({ t: alarme.acquitteeLe, etape: 'acquittement' });
  if (alarme.finLe) {
    evenements.push({ t: alarme.finLe, etape: 'reparation' }, { t: alarme.finLe, etape: 'redemarrage' });
    if (reprise! <= fin) evenements.push({ t: reprise!, etape: 'production' });
  }
  evenements.sort((a, b) => a.t - b.t);
  return { alarme, machine, organe, point, points, debut, fin, pas, images, evenements };
}
