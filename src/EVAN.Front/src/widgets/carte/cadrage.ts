/**
 * Cadrage de la carte sur des bâtiments ou des points. Module léger (types seuls, comme marges.ts) : la navigation,
 * la visite et le changement d'usine s'en servent sans charger MapLibre, qui n'arrive qu'avec la carte elle-même.
 */
import type * as maplibregl from 'maplibre-gl';
import type { Batiment } from '@/domain/types';
import type { LngLat } from '@/geo/geodesy';
import { isReducedMotion } from '@/store/ui';
import { margesCarte } from './marges';

/** Rectangle englobant (sud-ouest, nord-est) de points, sous la forme qu'acceptent les méthodes de la carte. */
export function emprise(pts: readonly LngLat[]): [LngLat, LngLat] {
  const lng = pts.map((p) => p[0]);
  const lat = pts.map((p) => p[1]);
  return [
    [Math.min(...lng), Math.min(...lat)],
    [Math.max(...lng), Math.max(...lat)],
  ];
}

export function fitSite(map: maplibregl.Map, batiments: Batiment[], opts: { duration?: number; pitch?: number; bearing?: number; padding?: number } = {}) {
  const pts = batiments.flatMap((b) => b.contour);
  if (!pts.length) return;
  const cam = map.cameraForBounds(emprise(pts), { padding: margesCarte(map, opts.padding ?? 50), bearing: opts.bearing ?? map.getBearing() });
  if (!cam) return;
  map.easeTo({
    center: cam.center,
    zoom: Math.min(cam.zoom ?? 17, 19.2),
    bearing: opts.bearing ?? map.getBearing(),
    pitch: opts.pitch ?? map.getPitch(),
    duration: isReducedMotion() ? 0 : (opts.duration ?? 1200),
  });
}
