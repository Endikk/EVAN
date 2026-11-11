/**
 * Panne d'exercice (« Simuler une panne ») ou panne réelle. Le cramoisi est réservé à la panne réelle : une panne
 * d'exercice se reconnaît à son pointillé, comme le bouton qui la déclenche.
 *
 * Le simulateur marque l'alarme à sa naissance (`exercice`, sim/simulator.ts) : elle le reste jusqu'au bout, même
 * quand la trace de détection a disparu. Les alarmes de l'API ne sont jamais des exercices.
 */
import type { Alarme } from '@/domain/types';

export function estExercice(a: Pick<Alarme, 'exercice'> | undefined): boolean {
  return !!a?.exercice;
}
