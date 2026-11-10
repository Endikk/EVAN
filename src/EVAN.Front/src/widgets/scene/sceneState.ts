import { create } from 'zustand';
import type * as THREE from 'three';
import type { CameraControls } from '@react-three/drei';
import type { XY } from '@/geo/geodesy';
import type { CameraFocus } from '@/store/ui';

interface SceneUi {
  dragging: boolean;
  ghost?: { type: string; pos: XY; valid: boolean };
  /** Type de machine en cours de glisser depuis la bibliothèque. */
  dragType?: string;
  /** Rotation en cours avec les poignées (angle affiché en direct). */
  rotating?: { id: string; numero: string; deg: number };
  hoverMachineId?: string;
  groundReady: boolean;
  /** Plan 2D : pixels par mètre (zoom de la caméra orthographique), pour l'échelle et le niveau de détail. */
  planZoom: number;
  /** Plan 2D : fond « plan » épuré ou orthophoto. */
  planFond: 'plan' | 'satellite';
  /** Changement d'usine en cours : la scène est démontée, puis remontée sur la nouvelle usine. */
  switching: boolean;
  set(p: Partial<SceneUi>): void;
}

export const useSceneUi = create<SceneUi>()((set) => ({
  dragging: false,
  groundReady: false,
  planZoom: 6,
  planFond: 'plan',
  switching: false,
  set: (p) => set(p),
}));

/** Accès impératif à la caméra et au raycasting depuis le DOM (glisser-déposer de la bibliothèque). */
export const sceneHandle: {
  controls: CameraControls | null;
  camera: THREE.Camera | null;
  canvas: HTMLCanvasElement | null;
  /** Cadrage du plan 2D pour un focus (fourni par la caméra). */
  planTarget?: (f: CameraFocus) => { center: XY; zoom: number };
  /** Point du sol sous un point de l'écran, fourni par sol.ts avec la scène. */
  solSous?: (clientX: number, clientY: number) => XY | null;
} = { controls: null, camera: null, canvas: null };

export const GRID_STEP = 0.5;
export const snap = (v: number, step = GRID_STEP) => Math.round(v / step) * step;

/**
 * Point du sol (repère local du site) sous un point de l'écran ; nul tant que la scène n'est pas là. Le calcul, en
 * Three.js, est dans sol.ts : l'espace de travail lit l'état de la scène sans charger Three.js avant la scène.
 */
export function groundPointFromClient(clientX: number, clientY: number): XY | null {
  return sceneHandle.solSous?.(clientX, clientY) ?? null;
}

/** Curseur « pivoter » (flèche circulaire) pour les coins des machines. */
export const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12a7 7 0 1 1-2.05-4.95" stroke="#fff" stroke-width="5"/><path d="M19 4v4h-4" stroke="#fff" stroke-width="5"/><path d="M19 12a7 7 0 1 1-2.05-4.95" stroke="#cf3f0b" stroke-width="2.2"/><path d="M19 4v4h-4" stroke="#cf3f0b" stroke-width="2.2"/></g></svg>',
)}") 12 12, alias`;

/** Passage 2D → 3D : la caméra 3D repart exactement du cadrage du plan (vue de dessus) avant de s'incliner. */
export const planHandoff: { current: { center: XY; zoom: number } | null } = { current: null };

/** Angle (degrés, sens du plan : de +x vers +z) arrondi au pas d'aimantation et ramené dans [0, 360[. */
export function snapAngle(deg: number, step = 15): number {
  const v = Math.round(deg / step) * step;
  return ((v % 360) + 360) % 360;
}
