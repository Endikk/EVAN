/** Ajout d'une zone au plan, une fois son contour tracé (éditeur de zones du plan 2D). */
import { batimentSous, useProject } from '@/store/project';
import { niveauActif } from '@/store/niveau';
import { polygonCentroid } from '@/geo/geodesy';
import { useUi } from '@/store/ui';
import type { TypeZone } from '@/domain/types';
import { uid } from '@/sim/random';
import { ZONE_LIBELLE } from './Zones3D';

export function addZoneFromPolygon(poly: [number, number][], type: TypeZone) {
  const { site, batiments, zones } = useProject.getState();
  const n = zones.filter((z) => z.type === type).length + 1;
  // La zone va au niveau affiché, dans le bâtiment où elle est tracée. Le rez-de-chaussée ne s'écrit pas.
  const niveau = niveauActif();
  const z = {
    id: uid('zone'),
    batimentId: batimentSous(site, batiments, polygonCentroid(poly), niveau)?.id ?? '',
    nom: `${ZONE_LIBELLE[type]}${n > 1 ? ` ${n}` : ''}`,
    type,
    polygone: poly,
    ...(niveau > 0 ? { niveau } : {}),
  };
  useProject.getState().addZone(z);
  useUi.getState().selectZone(z.id);
}
