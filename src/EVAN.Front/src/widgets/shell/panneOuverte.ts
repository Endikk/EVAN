/**
 * Panne en cours, vue de n'importe quel écran : la barre du haut la garde en pastille (« Panne sur R01 · Voir ») et
 * l'entrée Supervision de la barre latérale porte une marque, tant qu'une alarme critique reste ouverte. L'avis du
 * coin de l'écran, lui, disparaît au bout de 12 s.
 */
import type { Alarme, Machine } from '@/domain/types';

export interface PanneOuverte {
  /** L'alarme critique ouverte la plus récente : celle que « Voir » montre. */
  alarme: Alarme;
  /** Nombre d'alarmes critiques ouvertes. */
  nombre: number;
  /** Ce que dit la pastille : « Panne sur R01 », « 2 pannes en cours ». */
  libelle: string;
  /** Toutes sont des pannes d'exercice : la pastille reste neutre, en pointillé. */
  exercice: boolean;
}

export function panneOuverte(alarms: Alarme[], machines: Pick<Machine, 'id' | 'numero'>[]): PanneOuverte | undefined {
  const ouvertes = alarms.filter((a) => a.gravite === 'critique' && a.statut !== 'resolue').sort((a, b) => b.horodatage - a.horodatage);
  const alarme = ouvertes[0];
  if (!alarme) return undefined;
  const exercice = ouvertes.every((a) => !!a.exercice);
  const numero = machines.find((m) => m.id === alarme.machineId)?.numero;
  const nom = exercice ? 'Panne d’exercice' : 'Panne';
  const libelle = ouvertes.length > 1 ? `${ouvertes.length} pannes en cours` : numero ? `${nom} sur ${numero}` : `${nom} en cours`;
  return { alarme, nombre: ouvertes.length, libelle, exercice };
}
