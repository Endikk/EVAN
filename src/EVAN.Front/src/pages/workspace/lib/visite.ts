/**
 * Visite guidée lancée par l'adresse (/demo?visite=6) : le chapitre de départ, et l'écran sur lequel l'espace de
 * travail s'ouvre pour lui. Les chapitres de la configuration (1 à 5) partent de la carte, qu'ils racontent ; ceux de
 * l'exploitation s'ouvrent directement sur leur écran, sans repasser par la carte et sa transition vers la 3D. C'est ce
 * qui fait arriver « Voir la démo » de l'accueil sur la supervision en quelques secondes.
 */
import type { Step } from '@/store/ui';

/** Nombre de chapitres de la visite (widgets/tour/tour.ts, CHAPITRES). */
const DERNIER_CHAPITRE = 12;

/** Chapitre de départ de la visite : ?visite=8 démarre directement à la maintenance. */
export function chapitreDepart(params: URLSearchParams): number {
  const n = Number(params.get('visite'));
  return Number.isInteger(n) && n >= 1 ? Math.min(n, DERNIER_CHAPITRE) : 1;
}

/** Écran d'ouverture pour un chapitre : la carte pour la configuration, l'écran du chapitre pour l'exploitation. */
export function etapeOuvertureVisite(chapitre: number): Step {
  if (chapitre <= 5) return 1;
  if (chapitre <= 9) return chapitre as Step;
  // Plusieurs usines, Demander à EVAN, Et après : depuis la supervision.
  return 6;
}
