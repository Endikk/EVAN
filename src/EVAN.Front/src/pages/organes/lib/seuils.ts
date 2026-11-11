/**
 * Les seuils d'un point de mesure, vus comme une bande : la plage normale au milieu, l'attention de part et d'autre,
 * l'alarme aux extrémités. Les largeurs respectent les vraies valeurs, pour qu'on voie d'un coup d'œil la marge qui
 * reste ; les nombres, eux, restent dans la phrase de lecture et dans le détail.
 */
import type { Seuils } from '@/domain/types';

export type Plage = 'normal' | 'attention' | 'alarme';

export interface Segment {
  plage: Plage;
  /** Bornes en fraction de la bande (0 à 1). */
  x0: number;
  x1: number;
}

export interface Bande {
  min: number;
  max: number;
  segments: Segment[];
}

/** Marge ajoutée de part et d'autre des valeurs connues, pour que les zones extrêmes restent visibles. */
const MARGE = 0.2;

export function bandeSeuils(seuils: Seuils, nominal: number): Bande | null {
  const { alarmeBas, attentionBas, attentionHaut, alarmeHaut } = seuils;
  const definis = [alarmeBas, attentionBas, attentionHaut, alarmeHaut].filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (!definis.length) return null;
  const valeurs = [nominal, ...definis];
  const lo = Math.min(...valeurs);
  const hi = Math.max(...valeurs);
  const ecart = hi - lo || Math.abs(hi) || 1;
  // Une grandeur qui ne descend jamais sous zéro (diamètre, température d'encre…) ne s'étend pas sous zéro.
  const min = lo >= 0 ? Math.max(0, lo - ecart * MARGE) : lo - ecart * MARGE;
  const max = hi + ecart * MARGE;
  const x = (v: number) => (v - min) / (max - min);

  // Les bornes sont prises dans l'ordre et jamais en arrière : des seuils saisis dans le désordre ne cassent pas la bande.
  const bornes: { v: number; plage: Plage }[] = [];
  let curseur = min;
  const pousser = (v: number | undefined, plage: Plage) => {
    if (v === undefined || !Number.isFinite(v)) return;
    const borne = Math.min(max, Math.max(curseur, v));
    bornes.push({ v: borne, plage });
    curseur = borne;
  };
  pousser(alarmeBas, 'alarme');
  pousser(attentionBas, 'attention');
  pousser(attentionHaut ?? alarmeHaut, 'normal');
  if (attentionHaut !== undefined && alarmeHaut !== undefined) pousser(alarmeHaut, 'attention');
  bornes.push({ v: max, plage: alarmeHaut !== undefined ? 'alarme' : attentionHaut !== undefined ? 'attention' : 'normal' });

  const segments: Segment[] = [];
  let depart = min;
  for (const b of bornes) {
    if (b.v > depart) segments.push({ plage: b.plage, x0: x(depart), x1: x(b.v) });
    depart = b.v;
  }
  return { min, max, segments: fusionner(segments) };
}

/** Deux segments voisins de même plage n'en font qu'un. */
function fusionner(segments: Segment[]): Segment[] {
  return segments.reduce<Segment[]>((acc, s) => {
    const prec = acc[acc.length - 1];
    return prec && prec.plage === s.plage ? [...acc.slice(0, -1), { ...prec, x1: s.x1 }] : [...acc, s];
  }, []);
}

/** Position d'une valeur sur la bande, ramenée dans ses bords. */
export function position(bande: Bande, v: number): number {
  return Math.min(1, Math.max(0, (v - bande.min) / (bande.max - bande.min)));
}

/** La règle des seuils en une ou deux phrases, avec les nombres : c'est ce qui s'affiche au survol et se lit à voix haute. */
const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** Un seuil tel qu'on l'a saisi : 90 reste 90, 296,6 reste 296,6. */
export function nombreSeuil(v: number, unite: string): string {
  return unite ? `${NOMBRE.format(v)} ${unite}` : NOMBRE.format(v);
}

export function lectureSeuils(seuils: Seuils, unite: string): string {
  const f = (v: number) => nombreSeuil(v, unite);
  const { alarmeBas, attentionBas, attentionHaut, alarmeHaut } = seuils;
  const bas = attentionBas ?? alarmeBas;
  const haut = attentionHaut ?? alarmeHaut;
  const phrases: string[] = [];
  if (bas !== undefined && haut !== undefined) phrases.push(`Normal entre ${f(bas)} et ${f(haut)}.`);
  else if (haut !== undefined) phrases.push(`Normal jusqu’à ${f(haut)}.`);
  else if (bas !== undefined) phrases.push(`Normal au-dessus de ${f(bas)}.`);
  const attention = [attentionBas !== undefined && `sous ${f(attentionBas)}`, attentionHaut !== undefined && `au-dessus de ${f(attentionHaut)}`].filter(Boolean);
  if (attention.length) phrases.push(`Attention ${attention.join(' ou ')}.`);
  const alarme = [alarmeBas !== undefined && `sous ${f(alarmeBas)}`, alarmeHaut !== undefined && `au-dessus de ${f(alarmeHaut)}`].filter(Boolean);
  if (alarme.length) phrases.push(`Alarme ${alarme.join(' ou ')}.`);
  return phrases.join(' ');
}

export const MOT_PLAGE: Record<Plage, string> = { normal: 'Normal', attention: 'Attention', alarme: 'Alarme' };

// ---------- Saisie des seuils ----------

/** Les quatre seuils, du plus bas au plus haut, avec le libellé de leur champ. */
export const ORDRE_SEUILS: { k: keyof Seuils; l: string }[] = [
  { k: 'alarmeBas', l: 'Alarme sous' },
  { k: 'attentionBas', l: 'Attention sous' },
  { k: 'attentionHaut', l: 'Attention au-delà de' },
  { k: 'alarmeHaut', l: 'Alarme au-delà de' },
];

/** Seuils tels qu'on les tape : du texte par champ, vide pour « aucun ». */
export type SaisieSeuils = Record<keyof Seuils, string>;

export function versSaisie(s: Seuils): SaisieSeuils {
  const t = (v?: number) => (v === undefined ? '' : String(v));
  return { alarmeBas: t(s.alarmeBas), attentionBas: t(s.attentionBas), attentionHaut: t(s.attentionHaut), alarmeHaut: t(s.alarmeHaut) };
}

/**
 * Les seuils d'une saisie, ou ce qui l'empêche : un nombre illisible, ou deux seuils dans le désordre (l'alarme basse doit
 * rester sous l'attention basse, qui reste sous l'attention haute, elle-même sous l'alarme haute). Un champ vide veut
 * dire « pas de seuil ».
 */
export function lireSaisie(saisie: SaisieSeuils): { seuils: Seuils } | { erreur: string; champ: keyof Seuils } {
  const seuils: Seuils = {};
  for (const { k, l } of ORDRE_SEUILS) {
    const brut = saisie[k].trim().replace(',', '.');
    if (!brut) continue;
    const n = Number(brut);
    if (!Number.isFinite(n)) return { erreur: `« ${l} » n’est pas un nombre.`, champ: k };
    seuils[k] = n;
  }
  const definis = ORDRE_SEUILS.filter(({ k }) => seuils[k] !== undefined);
  for (let i = 1; i < definis.length; i++) {
    const bas = definis[i - 1];
    const haut = definis[i];
    if ((seuils[bas.k] as number) >= (seuils[haut.k] as number)) {
      return { erreur: `« ${bas.l} » doit rester sous « ${haut.l} ».`, champ: haut.k };
    }
  }
  return { seuils };
}

/** Deux jeux de seuils identiques (pour savoir si l'on s'écarte de ceux du kit). */
export function memesSeuils(a: Seuils, b: Seuils): boolean {
  return ORDRE_SEUILS.every(({ k }) => a[k] === b[k]);
}
