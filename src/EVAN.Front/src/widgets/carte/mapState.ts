import { create } from 'zustand';
import type * as maplibregl from 'maplibre-gl';
import type { LngLat } from '@/geo/geodesy';
import type { Localisation } from '@/geo/candidates';

export type MapMode = 'browse' | 'edit' | 'draw';

interface MapUiState {
  mode: MapMode;
  zoom: number;
  mpp: number;
  pitch3d: boolean;
  detecting: boolean;
  detectError?: string;
  /** Dernier bâtiment ajouté, pour l'animation de tracé. */
  lastAddedId?: string;
  /** Instant de cet ajout (performance.now) : l'étiquette de surface n'apparaît en relief que juste après. */
  lastAddedAt?: number;
  drawPoints: LngLat[];
  /** Contour en cours de déplacement (surface affichée en direct pendant le glisser). */
  editing?: { id: string; ring: LngLat[]; sigmas: number[] };
  /** Recherche des bâtiments candidats en cours (libellé affiché). */
  locating?: string;
  /** Bâtiments proposés pour l'adresse cherchée, à confirmer par l'utilisateur. */
  localisation?: Localisation;
  /** Candidat survolé (référence BD TOPO), surligné sur la carte et dans la liste. */
  hoverCandidate?: string;
  setMode(m: MapMode): void;
  set(p: Partial<MapUiState>): void;
}

export const useMapUi = create<MapUiState>()((set) => ({
  mode: 'browse',
  zoom: 5,
  mpp: 1000,
  pitch3d: false,
  detecting: false,
  drawPoints: [],
  setMode: (mode) => set({ mode, drawPoints: [] }),
  set: (p) => set(p),
}));

/** Accès impératif à la carte (transitions de caméra, visite guidée). */
export const mapHandle: { map: maplibregl.Map | null } = { map: null };

/** Instantané de caméra carte pour enchaîner sans rupture vers la scène 3D. */
export interface MapCameraSnapshot {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  height: number;
  fovDeg: number;
}

export const handoff: { snapshot: MapCameraSnapshot | null } = { snapshot: null };

export function snapshotMapCamera(): MapCameraSnapshot | null {
  const map = mapHandle.map;
  if (!map) return null;
  const c = map.getCenter();
  return {
    center: [c.lng, c.lat],
    zoom: map.getZoom(),
    pitch: map.getPitch(),
    bearing: map.getBearing(),
    height: map.getContainer().clientHeight,
    fovDeg: 36.87,
  };
}
