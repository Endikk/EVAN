/**
 * Où en est la pose des machines, calculé sur les machines réellement posées : le numéro est obligatoire et doit
 * être unique (c'est lui qu'on retrouve sur le plan et dans les alarmes), le nom est un confort pour l'atelier.
 */
import type { Machine } from '@/domain/types';

export interface EtatPose {
  total: number;
  /** Numéros portés par plusieurs machines. */
  numerosEnDouble: string[];
  /** Machines sans numéro. */
  sansNumero: number;
  /** Noms portés par plusieurs machines, avec leur nombre, du plus fréquent au moins fréquent. */
  nomsEnDouble: { nom: string; n: number }[];
}

function doublons(valeurs: string[]): Map<string, number> {
  const compte = new Map<string, number>();
  for (const v of valeurs) compte.set(v, (compte.get(v) ?? 0) + 1);
  return new Map([...compte].filter(([, n]) => n > 1));
}

export function etatPose(machines: readonly Pick<Machine, 'numero' | 'nom'>[]): EtatPose {
  const numeros = machines.map((m) => m.numero.trim()).filter(Boolean);
  const noms = machines.map((m) => m.nom.trim()).filter(Boolean);
  return {
    total: machines.length,
    numerosEnDouble: [...doublons(numeros).keys()],
    sansNumero: machines.length - numeros.length,
    nomsEnDouble: [...doublons(noms)].map(([nom, n]) => ({ nom, n })).sort((a, b) => b.n - a.n),
  };
}

export const numerotationOk = (e: EtatPose) => e.total > 0 && e.sansNumero === 0 && e.numerosEnDouble.length === 0;

/** Ce qui manque à la numérotation, en une phrase, ou rien si elle est bonne. */
export function problemeNumeros(e: EtatPose): string | undefined {
  if (e.sansNumero > 0) return e.sansNumero === 1 ? 'Une machine n’a pas de numéro.' : `${e.sansNumero} machines n’ont pas de numéro.`;
  if (e.numerosEnDouble.length) return `Deux machines portent le numéro ${e.numerosEnDouble[0]}.`;
  return undefined;
}
