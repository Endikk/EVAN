/**
 * Où se trouve une alarme, en mots : la machine et l'organe, avec le point de mesure et la panne type du catalogue
 * quand ils existent. Les organes d'un modèle importé (saisies de l'utilisateur) remplacent ceux du catalogue.
 */
import type { Alarme, Machine, Organe, PointDeMesure } from '@/domain/types';
import { machineModel } from '@/domain/catalog';
import type { LieuAlarme } from './atelier';

type Perso = Record<string, { organes: Organe[]; points: PointDeMesure[] } | undefined>;

export function lieuAlarme(a: Pick<Alarme, 'machineId' | 'organeId'>, machines: Machine[], perso: Perso): LieuAlarme & { machine?: Machine } {
  const machine = machines.find((m) => m.id === a.machineId);
  if (!machine) return { numero: a.machineId };
  const organe = machineModel(machine, perso[machine.id]).organes.find((o) => o.id === a.organeId);
  return { numero: machine.numero, organe: organe?.nom, machine };
}
