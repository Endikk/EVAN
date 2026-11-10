/**
 * Mise en forme des grandeurs de l'écran énergie : on passe au MWh, au k€ et à la tonne dès que le nombre devient
 * long, pour qu'un chiffre se lise d'un coup d'œil.
 */
import { fmtNombre, pct } from '@/ui/format';

/** Espace insécable entre un nombre et son unité : « 12 % » ou « 6 093 € » ne se coupent jamais en fin de ligne. */
const NB = '\u00a0';

/** Nombre sans zéro inutile : « 4,5 », « 96 », jamais « 96,0 ». */
const sansZero = (v: number, max: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: max }).format(v);

export const kwh = (v: number) => (v >= 10_000 ? `${fmtNombre(v / 1000, 1)}${NB}MWh` : `${sansZero(v, v < 100 ? 1 : 0)}${NB}kWh`);
export const euros = (v: number) => (v >= 10_000 ? `${fmtNombre(v / 1000, 1)}${NB}k€` : `${fmtNombre(v, v < 10 ? 2 : 0)}${NB}€`);
export const co2 = (kg: number) => (kg >= 1000 ? `${fmtNombre(kg / 1000, 2)}${NB}t` : `${fmtNombre(kg)}${NB}kg`);
export const kw = (v: number) => `${sansZero(v, v < 10 ? 1 : 0)}${NB}kW`;
export const prixKwh = (v: number) => `${fmtNombre(v, 3)}${NB}€`;
export const pourcent = (v: number, decimales = 0) => pct(v, decimales).replace(' %', `${NB}%`);

const jourCourt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric' });
const heure = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « jeu. 8 », pour les axes. */
export const fmtJourCourt = (t: number) => jourCourt.format(t);
/** « jeudi 8 », dans les phrases. */
export const fmtJourLong = (t: number) => jourLong.format(t);
/** « jeudi 8 à 05:30 ». */
export const fmtMoment = (t: number) => `${jourLong.format(t)} à ${heure.format(t)}`;
export const fmtHeure = (t: number) => heure.format(t);

/**
 * Nombre de jours observés : « 6,95 jours », « 1 jour ». Deux décimales, pour qu'on puisse refaire le calcul de tête
 * et retomber sur le même résultat que l'écran.
 */
export function fmtJours(j: number): string {
  const arrondi = Math.round(j * 100) / 100;
  const decimales = Number.isInteger(arrondi) ? 0 : Number.isInteger(arrondi * 10) ? 1 : 2;
  return `${fmtNombre(arrondi, decimales)} jour${arrondi >= 2 ? 's' : ''}`;
}
