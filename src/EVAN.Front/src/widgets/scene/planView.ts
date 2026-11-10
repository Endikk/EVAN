/**
 * Bascule 3D ⇄ 2D sans coupure : avant le passage en plan, la caméra 3D se redresse à la verticale au cadrage
 * du plan ; au retour, la 3D repart de cette vue de dessus et s'incline vers sa cible.
 */
import type * as THREE from 'three';
import { useUi, isReducedMotion, type View } from '@/store/ui';
import { planHandoff, sceneHandle } from './sceneState';

let token = 0;

export async function switchView(v: View) {
  const ui = useUi.getState();
  if (ui.view === v) return;
  const id = ++token;
  const c = sceneHandle.controls;
  const cam = sceneHandle.camera;
  const inScene = ui.step >= 2 && ui.step <= 6;
  if (v === '2d') {
    if (c && inScene && !isReducedMotion() && sceneHandle.planTarget && sceneHandle.canvas && !(cam as THREE.OrthographicCamera)?.isOrthographicCamera) {
      const t = sceneHandle.planTarget(ui.focus);
      const d = (sceneHandle.canvas.clientHeight / t.zoom) * 1.5;
      c.smoothTime = 0.42;
      // La promesse de fin de transition peut tarder près de la verticale : on n'attend pas plus d'une seconde.
      await Promise.race([c.setLookAt(t.center[0], d, t.center[1] + 0.01, t.center[0], 0, t.center[1], true), new Promise((r) => window.setTimeout(r, 1000))]);
      if (id !== token) return;
    }
    useUi.getState().setView('2d');
    return;
  }
  if (c && cam && (cam as THREE.OrthographicCamera).isOrthographicCamera) {
    // Un vecteur pris à la caméra : ce module ne charge pas Three.js (l'espace de travail l'importe avant la scène).
    const target = c.getTarget(cam.position.clone());
    planHandoff.current = { center: [target.x, target.z], zoom: (cam as THREE.OrthographicCamera).zoom };
  }
  useUi.getState().setView('3d');
}

/** Zoom du plan 2D depuis les boutons (+, −, cadrer). */
export function zoomPlan(k: number | 'fit') {
  const c = sceneHandle.controls;
  const cam = sceneHandle.camera as THREE.OrthographicCamera | null;
  if (!c || !cam?.isOrthographicCamera) return;
  if (k === 'fit') {
    const t = sceneHandle.planTarget?.({ kind: 'site' });
    if (!t) return;
    void c.setLookAt(t.center[0], 150, t.center[1] + 0.001, t.center[0], 0, t.center[1], !isReducedMotion());
    void c.zoomTo(t.zoom, !isReducedMotion());
    return;
  }
  void c.zoomTo(cam.zoom * k, !isReducedMotion());
}
