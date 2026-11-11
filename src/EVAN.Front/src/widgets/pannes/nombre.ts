/** Lecture des nombres tapés par l'opérateur (outil du défaut répétitif) : virgule ou point, espaces de milliers. */

/** La valeur tapée, 0 si ce n'est pas un nombre. */
export function lireNombre(s: string): number {
  const v = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

/**
 * Ce qui ne va pas dans une saisie, en clair ; rien tant que le champ est vide ou juste. « 339,5 », « 339.5 » et
 * « 1 200 » passent ; « 12 mm », « abc » ou « 0 » non.
 */
export function erreurNombre(s: string): string | undefined {
  const t = s.trim();
  if (!t) return undefined;
  if (!/^\d[\d\s]*([.,]\d+)?$/.test(t)) return 'Un nombre seul, par exemple 339,5';
  return lireNombre(t) > 0 ? undefined : 'Un nombre plus grand que zéro';
}
