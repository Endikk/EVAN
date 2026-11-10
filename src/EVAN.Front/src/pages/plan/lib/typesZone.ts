/**
 * À quoi sert chaque type de zone, dit pour une imprimerie d'étiquettes : une ligne courte sur le bouton, une phrase
 * dans le guide. Les noms et couleurs restent ceux de la scène (ZONE_LIBELLE, ZONE_COULEUR).
 */
import type { TypeZone } from '@/domain/types';

export const ORDRE_ZONES: TypeZone[] = ['atelier', 'stock', 'expedition', 'prepresse', 'faconnage', 'bureaux'];

/** Sous le nom, sur le bouton : quelques mots. */
export const ZONE_COURT: Record<TypeZone, string> = {
  atelier: 'Les presses',
  stock: 'Bobines, produits finis',
  expedition: 'Départ des colis',
  prepresse: 'Fichiers et clichés',
  faconnage: 'Découpe, rembobinage',
  bureaux: 'Accueil, administration',
};

/** Dans le guide et en infobulle : une phrase. */
export const ZONE_SENS: Record<TypeZone, string> = {
  atelier: 'Là où tournent les presses qui impriment les étiquettes.',
  stock: 'Les bobines de papier vierges et les étiquettes finies qui attendent.',
  expedition: 'Là où l’on prépare les colis avant leur départ.',
  prepresse: 'Là où l’on prépare les fichiers et les clichés avant l’impression.',
  faconnage: 'Là où l’on découpe et rembobine les étiquettes imprimées.',
  bureaux: 'L’accueil et l’administration, hors de l’atelier.',
};

/** Nombre de types différents parmi les zones dessinées : une seule zone ne dit pas encore comment l'atelier est organisé. */
export function typesDistincts(zones: { type: TypeZone }[]): number {
  return new Set(zones.map((z) => z.type)).size;
}
