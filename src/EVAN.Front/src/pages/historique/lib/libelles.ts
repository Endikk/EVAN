/**
 * Les mots d'une alarme, les mêmes partout dans l'historique : le journal, ses filtres et le fichier exporté. Un
 * tableur qui dirait « acquittee » ou « critique » quand l'écran dit « Prise en charge » obligerait à traduire.
 */
import type { Alarme } from '@/domain/types';

/** La règle qui a levé l'alarme, dite comme dans le filtre « Type » du journal. */
export const TYPE_ALARME: Record<Alarme['regle'], string> = {
  seuil: 'Limite dépassée',
  derive: 'Dérive',
  repetitif: 'Défaut répétitif',
  automate: 'Signalée par l’automate',
};

/** Ce qui n'est pas réglé, en peu de mots : une alarme résolue n'en porte pas à l'écran (la ligne reste grise). */
export const ETAT_COURT: Partial<Record<Alarme['statut'], string>> = {
  active: 'Pas prise en charge',
  acquittee: 'Prise en charge',
};

/** Le statut complet, pour une colonne qui doit toujours dire quelque chose. */
export const ETAT_ALARME: Record<Alarme['statut'], string> = {
  active: 'Pas prise en charge',
  acquittee: 'Prise en charge',
  resolue: 'Résolue',
};

export const GRAVITE_ALARME: Record<Alarme['gravite'], string> = {
  critique: 'Critique',
  attention: 'Attention',
  info: 'Information',
};
