/**
 * Couleur d'interface posée dans la scène 3D et sur le plan 2D : contour de la machine choisie, poignées de rotation,
 * balise de l'organe choisi, mur et niveau en évidence. C'est le vermillon des jetons --accent : vif la nuit
 * (--accent-2), un cran plus soutenu le jour pour tenir sur la dalle claire.
 *
 * three.js ne lit pas les variables CSS : les valeurs sont recopiées ici, à garder alignées sur styles/jetons.css.
 */
import { useIsDark } from '@/store/ui';

export const SELECTION_NUIT = '#ff7a3d';
export const SELECTION_JOUR = '#e2470f';
/** Encre fixe, pour un dessin posé sur une pastille blanche (la flèche des poignées), quel que soit le thème. */
export const ENCRE = '#17181c';

export const couleurSelection = (dark: boolean): string => (dark ? SELECTION_NUIT : SELECTION_JOUR);

export function useCouleurSelection(): string {
  return couleurSelection(useIsDark());
}

/**
 * Trait neutre posé dans la scène (contour des zones de l'atelier) : l'ivoire la nuit, l'encre le jour. Une zone
 * n'est ni sélectionnée ni en alerte : elle ne prend ni le vermillon ni une couleur d'état.
 */
export const TRAIT_NUIT = '#f4f2ea';
export const TRAIT_JOUR = '#17181c';

export function useCouleurTrait(): string {
  return useIsDark() ? TRAIT_NUIT : TRAIT_JOUR;
}
