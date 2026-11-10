/**
 * Pose d'une machine sur le plan : depuis la bibliothèque (glisser-déposer ou clic), et depuis la visite guidée.
 */
import { batimentSous, useProject, zoneSous } from '@/store/project';
import { niveauActif } from '@/store/niveau';
import { useUi } from '@/store/ui';
import { MACHINE_TYPES } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { uid } from '@/sim/random';
import type { XY } from '@/geo/geodesy';

export const DND_TYPE = 'application/x-evan-machine';

/** Prochain numéro libre pour un préfixe (R01, R02…). */
export function nextNumero(prefix: string): string {
  const used = useProject
    .getState()
    .machines.map((m) => m.numero)
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `${prefix}${String(next).padStart(2, '0')}`;
}

export function placeMachine(type: string, pos: XY, url?: string, nom?: string): Machine {
  const def = MACHINE_TYPES[type];
  const { site, batiments, zones } = useProject.getState();
  // La machine se pose au niveau affiché. Le rez-de-chaussée ne s'écrit pas.
  const niveau = niveauActif();
  const zone = zoneSous(zones, pos, niveau);
  const m: Machine = {
    id: uid('m'),
    batimentId: zone?.batimentId ?? batimentSous(site, batiments, pos, niveau)?.id ?? '',
    zoneId: zone?.id,
    type: def ? type : 'custom',
    nom: nom ?? def?.libelle ?? 'Machine',
    numero: nextNumero(def?.prefixe ?? 'M'),
    position: pos,
    rotationDeg: 0,
    modele: { url: url ?? def?.modele ?? '', personnalise: !def },
    creeLe: Date.now(),
    ...(niveau > 0 ? { niveau } : {}),
  };
  useProject.getState().addMachine(m);
  useUi.getState().selectMachine(m.id);
  return m;
}
