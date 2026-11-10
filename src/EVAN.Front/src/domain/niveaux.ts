/**
 * Niveaux d'un bâtiment : 0 est le rez-de-chaussée, 1 le premier étage. Un bâtiment de `niveaux` 1 est de plain-pied.
 * Une zone ou une machine sans niveau enregistré est au rez-de-chaussée : les usines relevées avant les étages se
 * relisent telles quelles.
 */

/** Au-delà, ce n'est plus une usine : la saisie s'arrête là (le serveur accepte jusqu'à 200 pour les données IGN). */
export const NIVEAUX_MAX = 20;

export const niveauDe = (x: { niveau?: number }): number => x.niveau ?? 0;

export const nomNiveau = (n: number): string => (n <= 0 ? 'Rez-de-chaussée' : `Étage ${n}`);

/** Sur un bouton étroit : « RDC », puis le numéro de l'étage. */
export const nomNiveauCourt = (n: number): string => (n <= 0 ? 'RDC' : String(n));

/** Ce que veut dire un nombre de niveaux, en clair. */
export function composition(niveaux: number): string {
  const etages = borneNiveaux(niveaux) - 1;
  return etages === 0 ? 'Plain-pied' : `Rez-de-chaussée et ${etages} étage${etages > 1 ? 's' : ''}`;
}

/** Nombre de niveaux saisi, ramené à un entier entre 1 et NIVEAUX_MAX. */
export function borneNiveaux(n: number): number {
  return Number.isFinite(n) ? Math.min(NIVEAUX_MAX, Math.max(1, Math.round(n))) : 1;
}

/** Nombre de niveaux de l'usine : celui de son bâtiment le plus haut. */
export function nombreNiveaux(batiments: readonly { niveaux: number }[]): number {
  return Math.max(1, ...batiments.map((b) => borneNiveaux(b.niveaux)));
}

/** Niveau le plus haut où un bâtiment porte une zone ou une machine : on ne peut pas lui retirer ce niveau. */
export function niveauOccupeMax(
  batimentId: string,
  zones: readonly { batimentId: string; niveau?: number }[],
  machines: readonly { batimentId: string; niveau?: number }[],
): number {
  return Math.max(0, ...[...zones, ...machines].filter((x) => x.batimentId === batimentId).map(niveauDe));
}
