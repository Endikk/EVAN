/**
 * Couleur de chaque état dans les graphiques de l'écran : la même que l'état des machines partout dans EVAN.
 * Une panne se dessine en --crit, un réglage en --setup, la veille en gris neutre, la production en vert. Les graphiques
 * les posent en teinte calmée (charts.tsx) : des états qui ont un sens, pas une décoration.
 */
import type { EtatEnergie } from '@/analytics/energy';

export const COULEUR: Record<EtatEnergie, string> = {
  marche: 'var(--ok)',
  calage: 'var(--setup)',
  arret: 'var(--idle)',
  panne: 'var(--crit)',
};
