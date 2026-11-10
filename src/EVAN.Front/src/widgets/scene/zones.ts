/** Ajout d'une zone au plan, une fois son contour tracé (éditeur de zones du plan 2D). */
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import type { TypeZone } from '@/domain/types';
import { uid } from '@/sim/random';
import { ZONE_LIBELLE } from './Zones3D';

export function addZoneFromPolygon(poly: [number, number][], type: TypeZone) {
  const { batiments, zones } = useProject.getState();
  const n = zones.filter((z) => z.type === type).length + 1;
  const z = {
    id: uid('zone'),
    batimentId: batiments[0]?.id ?? '',
    nom: `${ZONE_LIBELLE[type]}${n > 1 ? ` ${n}` : ''}`,
    type,
    polygone: poly,
  };
  useProject.getState().addZone(z);
  useUi.getState().selectZone(z.id);
}
