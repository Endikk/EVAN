/**
 * Les mêmes mots pour les mêmes chiffres sur tous les écrans : une efficacité de 78 % se lit « Bon » en supervision
 * comme dans l'historique ou la vue d'ensemble.
 */
import type { Ton } from './PageIntro';

export interface Lecture {
  mot: string;
  ton: Ton;
}

/**
 * Efficacité des machines (TRS, de 0 à 1). 85 % est la référence couramment citée pour une usine de pointe ;
 * les autres paliers servent seulement à choisir le mot.
 */
export function lireEfficacite(trs: number): Lecture {
  if (!Number.isFinite(trs)) return { mot: 'Pas encore mesurée', ton: 'neutre' };
  if (trs >= 0.85) return { mot: 'Excellent', ton: 'ok' };
  if (trs >= 0.75) return { mot: 'Bon', ton: 'ok' };
  if (trs >= 0.6) return { mot: 'Correct', ton: 'neutre' };
  // Une efficacité basse se travaille, ce n'est pas une panne : jamais le ton « crit ».
  return { mot: 'À améliorer', ton: 'warn' };
}

/** Référence d'efficacité affichée comme cible des jauges. */
export const EFFICACITE_REFERENCE = 0.85;
