/**
 * « Où économiser » : chaque gisement d'économie devient une action dite en clair (quoi faire), avec ce qu'elle
 * rapporterait sur un an et le calcul pas à pas. Tous les chiffres viennent de l'historique et des réglages de l'écran.
 */
import type { BilanUsine, Gisement } from '@/analytics/energy';
import { MACHINE_TYPES } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import type { History } from '@/sim/history';
import { fmtNombre } from '@/ui/format';
import { euros, fmtJours, kw, kwh, pourcent, prixKwh } from './format';

const H = 3_600_000;

export interface ActionEco {
  cle: string;
  /** Quoi faire, à l'impératif. */
  titre: string;
  /** Pourquoi ça rapporte, en une phrase. */
  pourquoi: string;
  euroAn: number;
  kwhAn: number;
  /** Part de l'énergie de l'usine concernée. */
  part: number;
  /** Le calcul, une étape par ligne. */
  calcul: string[];
  /** Comment s'y prendre dans l'atelier. */
  conseil: string;
}

/** Nombre de périodes d'un état et leur durée cumulée sur la fenêtre (calages, pannes). */
export function compterPeriodes(h: History, machines: Machine[], from: number, to: number, etat: 'calage' | 'panne'): { nombre: number; heures: number } {
  let nombre = 0;
  let ms = 0;
  for (const m of machines) {
    for (const p of h.periodes[m.id] ?? []) {
      if (p.etat !== etat || p.fin <= from || p.debut >= to) continue;
      nombre += 1;
      ms += Math.min(p.fin, to) - Math.max(p.debut, from);
    }
  }
  return { nombre, heures: ms / H };
}

export interface ContexteEco {
  bilan: BilanUsine;
  jours: number;
  prix: number;
  machines: Machine[];
  calages: { nombre: number; heures: number };
  pannes: { nombre: number; heures: number };
  /** Puissance tirée quand rien ne produit (kW), lue sur la courbe de charge. */
  talon?: number;
}

/** Les deux dernières lignes de chaque calcul : ramener à l'année, puis passer en euros. */
function annuel(kwhPeriode: number, g: Gisement, c: ContexteEco): string[] {
  return [
    `Ramené à un an : ${kwh(kwhPeriode)} ÷ ${fmtJours(c.jours)} × 365 jours = ${kwh(g.kwhAn)}.`,
    `Au prix de ${prixKwh(c.prix)} le kWh : ${kwh(g.kwhAn)} × ${prixKwh(c.prix)} = ${euros(g.euroAn)} par an.`,
  ];
}

function actionCalage(g: Gisement, c: ContexteEco): ActionEco {
  const kwhP = c.bilan.total.kwh.calage;
  const parCalage = c.calages.nombre ? kwhP / c.calages.nombre : 0;
  return {
    cle: 'calage',
    titre: 'Regrouper les travaux pour faire moins de réglages',
    pourquoi: 'C’est ce que coûtent les réglages (calages) en électricité sur un an. Chaque calage évité en retire une part.',
    euroAn: g.euroAn,
    kwhAn: g.kwhAn,
    part: g.part,
    calcul: [
      c.calages.nombre
        ? `Sur la période observée (${fmtJours(c.jours)}), ${fmtNombre(c.calages.nombre)} calages ont consommé ${kwh(kwhP)}, soit ${kwh(parCalage)} et ${euros(parCalage * c.prix)} par calage en moyenne.`
        : `Sur la période observée (${fmtJours(c.jours)}), les calages ont consommé ${kwh(kwhP)}.`,
      ...annuel(kwhP, g, c),
    ],
    conseil:
      'Enchaîner les travaux de même format et de mêmes couleurs (impression en amalgame), préparer clichés, anilox et encres pendant que la machine imprime encore la série précédente.',
  };
}

function actionVeille(g: Gisement, c: ContexteEco): ActionEco {
  const kwhP = c.bilan.total.kwh.arret;
  return {
    cle: 'veille',
    titre: 'Couper ce qui reste allumé quand rien ne produit',
    pourquoi: 'C’est ce que coûte la veille sur un an : machines, sécheurs et armoires restés sous tension sans produire.',
    euroAn: g.euroAn,
    kwhAn: g.kwhAn,
    part: g.part,
    calcul: [
      `Sur la période observée (${fmtJours(c.jours)}), la veille a consommé ${kwh(kwhP)}.`,
      ...(c.talon !== undefined ? [`La nuit et le week-end, quand rien ne produit, l’usine tire encore ${kw(c.talon)} en continu.`] : []),
      ...annuel(kwhP, g, c),
    ],
    conseil:
      'À la fin du dernier poste, couper ce qui peut l’être : lampes UV, sécheurs, entraînements. Une liste d’arrêt affichée près de chaque machine aide à ne rien oublier.',
  };
}

function actionPanne(g: Gisement, c: ContexteEco): ActionEco {
  const kwhP = c.bilan.total.kwh.panne;
  const duree = `${fmtNombre(c.pannes.heures, c.pannes.heures < 10 ? 1 : 0)}\u00a0h`;
  return {
    cle: 'panne',
    titre: 'Réparer plus vite, ou couper la machine en panne',
    pourquoi: 'Une machine en panne reste sous tension pendant la réparation. Chaque heure gagnée sur la réparation retire une part de cette somme.',
    euroAn: g.euroAn,
    kwhAn: g.kwhAn,
    part: g.part,
    calcul: [
      c.pannes.nombre
        ? `Sur la période observée (${fmtJours(c.jours)}), ${fmtNombre(c.pannes.nombre)} pannes ont laissé des machines ${duree} sous tension, pour ${kwh(kwhP)}.`
        : `Sur la période observée (${fmtJours(c.jours)}), les pannes ont consommé ${kwh(kwhP)}.`,
      ...annuel(kwhP, g, c),
    ],
    conseil: 'Couper la machine quand la réparation s’annonce longue. Le temps pour réparer chaque panne se suit dans l’écran Maintenance.',
  };
}

function actionMachine(g: Extract<Gisement, { id: 'machine' }>, c: ContexteEco): ActionEco {
  const m = c.machines.find((x) => x.id === g.machineId);
  const b = c.bilan.parMachine.find((x) => x.machine.id === g.machineId)?.bilan;
  const type = MACHINE_TYPES[g.type];
  const nom = m?.numero ?? 'Une machine';
  const semblables = `machines du même type (${(type?.libelle ?? g.type).toLowerCase()})`;
  const unite = b?.unite ?? 'étiquettes';
  const kwhP = b ? ((g.intensite - g.moyenne) * b.production) / 1000 : 0;
  return {
    cle: `machine-${g.machineId}`,
    titre: `Chercher pourquoi ${nom} consomme plus que ses semblables`,
    pourquoi: `${nom} tire ${pourcent(g.ecart)} d’électricité de plus par ${unite.replace(/s$/, '')} que la moyenne des ${semblables}. Revenir à cette moyenne rapporterait cette somme.`,
    euroAn: g.euroAn,
    kwhAn: g.kwhAn,
    part: g.part,
    calcul: [
      `${nom} : ${fmtNombre(g.intensite, 2)} kWh pour 1 000 ${unite}. Moyenne des ${semblables} : ${fmtNombre(g.moyenne, 2)} kWh.`,
      ...(b ? [`L’écart, multiplié par ce qu’elle a produit (${fmtNombre(b.production)} ${unite}), fait ${kwh(kwhP)} sur ${fmtJours(c.jours)}.`] : []),
      ...annuel(kwhP, g, c),
    ],
    conseil:
      type?.categorie === 'impression'
        ? 'Contrôler les lampes UV et le séchage, la vitesse de production et le temps laissé sous tension entre deux séries, en comparant avec les autres presses du même type.'
        : 'Contrôler la vitesse de production et le temps laissé sous tension entre deux séries, en comparant avec les autres machines du même type.',
  };
}

/** Les actions, de la plus rentable à la moins rentable. */
export function actionsEconomie(pistes: Gisement[], c: ContexteEco): ActionEco[] {
  return pistes
    .filter((g) => g.euroAn > 0)
    .map((g) => {
      if (g.id === 'machine') return actionMachine(g, c);
      if (g.id === 'calage') return actionCalage(g, c);
      if (g.id === 'veille') return actionVeille(g, c);
      return actionPanne(g, c);
    })
    .sort((a, b) => b.euroAn - a.euroAn);
}
