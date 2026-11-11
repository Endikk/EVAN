/**
 * Les phrases de l'écran énergie, calculées sur les vraies données : le verdict du haut, la leçon de chaque graphique.
 * Aucune n'est figée : si l'usine consomme autrement, la phrase dit autre chose.
 */
import type { BilanUsine, EtatEnergie } from '@/analytics/energy';
import type { Ton } from '@/ui/explain';
import type { LectureCourbe } from './courbe';
import { euros, fmtJourLong, fmtMoment, kw, kwh, pourcent } from './format';

export type Periode = '24h' | '7j';

/** Ordre d'affichage : ce qui produit, puis ce qui se perd, du plus courant au plus rare. */
export const ETATS: EtatEnergie[] = ['marche', 'calage', 'arret', 'panne'];

/** Les états en mots de l'atelier. */
export const LIBELLE: Record<EtatEnergie, string> = {
  marche: 'Production',
  calage: 'Réglages (calage)',
  arret: 'Veille',
  panne: 'Panne sous tension',
};

/** Où est partie une part d'énergie hors production, en deux ou trois mots (la suite du verdict). */
const OU: Record<Exclude<EtatEnergie, 'marche'>, string> = {
  calage: 'en réglages (calages)',
  arret: 'en veille',
  panne: 'en pannes sous tension',
};

/**
 * Seuils du ton de l'écran, choisis pour EVAN (ce ne sont pas des normes) : au-delà d'un dixième de l'énergie
 * dépensée sans produire, on le signale ; au-delà d'un quart, c'est un problème.
 */
export const SEUIL_ATTENTION = 0.1;
export const SEUIL_PROBLEME = 0.25;

export function tonHorsProduction(part: number): Ton {
  if (part > SEUIL_PROBLEME) return 'crit';
  if (part > SEUIL_ATTENTION) return 'warn';
  return 'ok';
}

export const MOT_HORS_PRODUCTION: Record<Ton, string> = { ok: 'Faible', warn: 'À surveiller', crit: 'Trop élevée', neutre: '' };

export const LIBELLE_PERIODE: Record<Periode, string> = { '24h': 'Sur les dernières 24 heures', '7j': 'Sur 7 jours' };

/** Énergie partie hors production, de la plus grosse part à la plus petite. */
function pertesTriees(b: BilanUsine): Exclude<EtatEnergie, 'marche'>[] {
  return (['calage', 'arret', 'panne'] as const).filter((e) => b.total.kwh[e] > 0).sort((x, y) => b.total.kwh[y] - b.total.kwh[x]);
}

export interface Verdict {
  verdict: string;
  suite?: string;
  ton: Ton;
}

/**
 * La phrase du haut : combien, combien d'euros, et quelle part sans rien produire. `sujet` nomme la machine quand
 * l'écran est filtré sur une seule (« R07 a consommé »), sinon c'est l'usine.
 */
export function verdictEnergie(b: BilanUsine, periode: Periode, sujet?: string): Verdict {
  const total = b.total.total;
  const quand = LIBELLE_PERIODE[periode];
  const qui = sujet ?? 'l’usine';
  if (!(total > 0)) {
    return {
      ton: 'neutre',
      verdict: `${quand}, aucune consommation n’a encore été mesurée.`,
      suite: 'Les chiffres arrivent dès que les machines ont tourné.',
    };
  }
  const part = b.horsProduction;
  const ton = tonHorsProduction(part);
  const base = `${quand}, ${qui} a consommé ${kwh(total)}, soit ${euros(b.total.cout)}`;
  if (part >= 0.995) return { ton, verdict: `${base}, sans rien produire.`, suite: `Toute l’énergie est partie ${OU[pertesTriees(b)[0] ?? 'arret']}.` };
  if (part < 0.005) return { ton, verdict: `${base}, presque tout pour produire.` };
  const [a, bb] = pertesTriees(b);
  // Une suite courte : le détail est dans « Où part l'énergie », juste en dessous.
  const suite = bb ? `Surtout ${OU[a]}, puis ${OU[bb]}.` : `Cette part est partie ${OU[a]}.`;
  return { ton, verdict: `${base}, dont ${pourcent(part)} sans rien produire.`, suite };
}

/**
 * Parts sur 100, arrondies de façon que leur somme fasse exactement 100 (plus forts restes) : « sur 100 kWh,
 * 88 servent à produire ». Une part non nulle garde au moins son reste, elle ne disparaît pas sous l'arrondi.
 */
export function surCent(b: BilanUsine): Record<EtatEnergie, number> {
  const total = b.total.total;
  const out: Record<EtatEnergie, number> = { marche: 0, calage: 0, arret: 0, panne: 0 };
  if (!(total > 0)) return out;
  const brut = ETATS.map((e) => ({ e, v: (b.total.kwh[e] / total) * 100 }));
  let reste = 100;
  for (const { e, v } of brut) {
    out[e] = Math.floor(v);
    reste -= out[e];
  }
  const parReste = [...brut].sort((x, y) => (y.v - Math.floor(y.v)) - (x.v - Math.floor(x.v)));
  for (let i = 0; i < reste; i++) out[parReste[i % parReste.length].e] += 1;
  return out;
}

/**
 * Leçon de « Où part l'énergie », en une ligne : le reste se lit sur les barres. La part de production est arrondie
 * comme le pourcentage de sa ligne, juste dessous : « 89 » et « 89 % », jamais « 88 » à côté de « 89 % ».
 */
export function phraseRepartition(b: BilanUsine): string {
  if (!(b.total.total > 0)) return 'Rien à répartir sur cette période.';
  return `Sur 100 kWh consommés, ${Math.round((b.total.kwh.marche / b.total.total) * 100)} ont servi à produire.`;
}

/**
 * Ce que lit un lecteur d'écran sur la courbe de charge : le pic, puis ce que l'usine (ou la machine choisie, `sujet`)
 * tire encore quand rien ne produit.
 */
export function phraseCourbe(l: LectureCourbe, periode: Periode, prix: number, sujet = 'l’usine'): string {
  if (!l.pic) return 'Aucune puissance appelée sur cette période.';
  const pic = `Le pic : ${kw(l.pic.kw)}, ${fmtMoment(l.pic.t)}.`;
  if (l.talon === undefined) return `${pic} Les machines ont travaillé sans interruption sur la période.`;
  const quand = l.nuits && l.weekEnd ? 'La nuit et le week-end' : l.weekEnd ? 'Le week-end' : 'La nuit';
  const sur = periode === '7j' ? 'sur 7 jours' : 'sur 24 heures';
  return `${pic} ${quand}, rien ne produit mais ${sujet} tire encore ${kw(l.talon)} : ${kwh(l.kwhCreux)} ${sur}, soit ${euros(l.kwhCreux * prix)}.`;
}

/**
 * Leçon de la courbe de charge, en une ligne : ce que l'usine tire encore quand rien ne produit, et ce que ça coûte.
 * Le pic se lit sur la courbe (un trait fin à sa hauteur) et dans sa légende.
 */
export function leconCourbe(l: LectureCourbe, periode: Periode, prix: number, sujet = 'l’usine'): string {
  if (!l.pic) return 'Aucune puissance appelée sur cette période.';
  if (l.talon === undefined) return 'Les machines ont travaillé sans interruption sur la période.';
  const quand = l.nuits && l.weekEnd ? 'La nuit et le week-end' : l.weekEnd ? 'Le week-end' : 'La nuit';
  const sur = periode === '7j' ? 'sur 7 jours' : 'sur 24 heures';
  return `${quand}, ${sujet} tire encore ${kw(l.talon)} sans produire : ${euros(l.kwhCreux * prix)} ${sur}.`;
}

const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Leçon de l'énergie par jour, en une ligne : un jour sans production s'il y en a un (ce que coûte la seule veille),
 * sinon le jour le plus chargé. Le total de chaque jour est écrit au-dessus de sa colonne. Le jour `enCours` (pas fini)
 * n'entre pas dans la comparaison : à 6 h du matin, il n'a encore rien produit sans être un jour sans production.
 */
export function phraseParJour(jours: { jour: number; kwh: Record<EtatEnergie, number>; total: number }[], enCours?: number): string {
  const avec = jours.filter((d) => d.total > 0 && d.jour !== enCours);
  if (!avec.length) return 'Aucune consommation sur ces 7 jours.';
  const sansProduction = avec.find((d) => d.kwh.marche === 0);
  if (sansProduction) return `${majuscule(fmtJourLong(sansProduction.jour))}, sans rien produire : ${kwh(sansProduction.total)} de veille.`;
  const max = avec.reduce((a, d) => (d.total > a.total ? d : a));
  return `Le jour le plus chargé : ${fmtJourLong(max.jour)}, ${kwh(max.total)}.`;
}

/** Ce qu'une machine a dépensé sans produire : réglages, veille et pannes sous tension (kWh). */
export const horsProductionKwh = (k: Record<EtatEnergie, number>) => k.calage + k.arret + k.panne;

/**
 * Leçon du bloc « Par machine » : la machine qui dépense le plus sans produire, en kWh et en euros. C'est par elle que
 * le graphique est classé (pas par la consommation totale, qui suit surtout la taille de la machine).
 */
export function leconParMachine(b: BilanUsine, prix: number): string {
  const pire = b.parMachine.reduce<BilanUsine['parMachine'][number] | undefined>(
    (a, x) => (!a || horsProductionKwh(x.bilan.kwh) > horsProductionKwh(a.bilan.kwh) ? x : a),
    undefined,
  );
  const k = pire ? horsProductionKwh(pire.bilan.kwh) : 0;
  if (!pire || !(k > 0)) return 'Aucune machine n’a dépensé d’énergie sans produire.';
  return `${pire.machine.numero} dépense le plus sans produire : ${kwh(k)}, soit ${euros(k * prix)}.`;
}
