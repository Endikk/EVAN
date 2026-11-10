/**
 * Calculs Three.js au sol de la scène : point visé sous le pointeur, échelle à l'écran. À part de sceneState.ts, qui
 * reste sans Three.js : l'espace de travail (glisser-déposer, barre d'outils) le lit avant que la scène soit chargée.
 */
import * as THREE from 'three';
import type { XY } from '@/geo/geodesy';
import { sceneHandle } from './sceneState';

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/** Point du sol (repère local du site) sous un point de l'écran. */
export function groundPointFromClient(clientX: number, clientY: number): XY | null {
  const cam = sceneHandle.camera;
  const canvas = sceneHandle.canvas;
  if (!cam || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, cam);
  const p = new THREE.Vector3();
  return ray.ray.intersectPlane(GROUND_PLANE, p) ? [p.x, p.z] : null;
}

const tmpV = new THREE.Vector3();

/** Mètres par pixel à l'endroit d'un objet : poignées et repères gardent la même taille à l'écran, en 3D comme en 2D. */
export function worldPerPixel(camera: THREE.Camera, at: THREE.Vector3, viewportHeight: number): number {
  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) return 1 / (camera as THREE.OrthographicCamera).zoom;
  const cam = camera as THREE.PerspectiveCamera;
  const d = cam.getWorldPosition(tmpV).distanceTo(at);
  return (2 * d * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);
}

// Le glisser-déposer de la bibliothèque, hors du moteur 3D, passe par sceneHandle.
sceneHandle.solSous = groundPointFromClient;
