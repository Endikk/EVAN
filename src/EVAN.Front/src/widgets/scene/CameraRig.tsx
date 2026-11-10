/**
 * Caméra : transitions continues site → machine → organe (camera-controls),
 * reprise exacte du point de vue de la carte satellite au passage en 3D,
 * et plan 2D : caméra orthographique vue de dessus (glisser = déplacer, molette = zoom vers le curseur).
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { CameraControls, CameraControlsImpl } from '@react-three/drei';
import { useProject } from '@/store/project';
import { useUi, isReducedMotion, type CameraFocus, type View } from '@/store/ui';
import { machineModel, MODEL_FOOTPRINT } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { metersPerPixel, toLocal, type Frame, type XY } from '@/geo/geodesy';
import { handoff, type MapCameraSnapshot } from '@/widgets/carte/mapState';
import { planHandoff, sceneHandle, useSceneUi } from './sceneState';

const { ACTION } = CameraControlsImpl;
/** Hauteur de la caméra orthographique (sans effet sur l'échelle, seulement sur le plan de coupe). */
const PLAN_EYE = 150;

type Pose = [number, number, number, number, number, number];

function rotate(m: Machine, [x, y, z]: [number, number, number]): [number, number, number] {
  const a = (-m.rotationDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [m.position[0] + x * c + z * s, y, m.position[1] - x * s + z * c];
}

/** Vue d'une machine ; en placement (wide), plus haute et plus large pour voir les poignées et les voisines. */
export function machinePose(m: Machine, wide = false): Pose {
  const fp = MODEL_FOOTPRINT[m.type] ?? MODEL_FOOTPRINT.custom;
  const len = fp.max[0] - fp.min[0];
  const cxl = (fp.max[0] + fp.min[0]) / 2;
  const t = rotate(m, [cxl, wide ? 0.3 : 0.9, 0.1]);
  const dist = wide ? Math.max(13, len * 2.2) : Math.max(6.5, len * 1.25);
  const p = wide ? rotate(m, [cxl + dist * 0.15, dist * 0.85, dist * 0.6]) : rotate(m, [cxl + dist * 0.28, dist * 0.55, dist * 0.95]);
  return [...p, ...t];
}

export function organPose(m: Machine, local: [number, number, number]): Pose {
  const t = rotate(m, local);
  const p = rotate(m, [local[0] + 0.7, local[1] + 1.25, local[2] + 2.6]);
  return [...p, ...t];
}

export function overviewPose(center: XY, size: XY): Pose {
  // Cadrage : tout le site tient dans le champ vertical de 36,87° (même focale que la carte).
  const d = Math.max(size[0], size[1]) * 1.25 + 30;
  const polar = (52 * Math.PI) / 180;
  const az = 0.32;
  return [
    center[0] + Math.sin(az) * d * Math.sin(polar),
    d * Math.cos(polar),
    center[1] + Math.cos(az) * d * Math.sin(polar),
    center[0],
    0,
    center[1],
  ];
}

/** Pose 3D équivalente à la caméra MapLibre (même centre, distance, inclinaison, cap). */
export function poseFromMap(s: MapCameraSnapshot, frame: Frame): Pose {
  const target = toLocal(frame, s.center);
  const mpp = metersPerPixel(s.center[1], s.zoom);
  const d = (s.height / 2 / Math.tan(((s.fovDeg / 2) * Math.PI) / 180)) * mpp;
  const pitch = (s.pitch * Math.PI) / 180;
  const b = (s.bearing * Math.PI) / 180;
  const e = Math.sin(b);
  const n = Math.cos(b);
  const t = (frame.angleDeg * Math.PI) / 180;
  const u = e * Math.cos(t) + n * Math.sin(t);
  const w = -e * Math.sin(t) + n * Math.cos(t);
  const dir: XY = [u, -w];
  const h = d * Math.sin(Math.max(0.001, pitch));
  return [target[0] - dir[0] * h, d * Math.cos(pitch), target[1] - dir[1] * h, target[0], 0, target[1]];
}

/** Cible du plan 2D pour un focus : centre (repère local) et zoom (pixels par mètre). */
/** Zoom qui fait tenir tout le site sur le plan, sous les commandes flottantes (haut et bas). */
const planFit = (size: XY, vp: { width: number; height: number }) => Math.min((vp.width - 40) / (size[0] * 1.08 + 8), (vp.height - 130) / (size[1] * 1.08 + 8));

export function planTarget(f: CameraFocus, center: XY, size: XY, vp: { width: number; height: number }): { center: XY; zoom: number } {
  const fit = planFit(size, vp);
  if (f.kind === 'site') return { center, zoom: fit };
  const m = useProject.getState().machines.find((x) => x.id === f.machineId);
  if (!m) return { center, zoom: fit };
  if (f.kind === 'machine') return { center: m.position, zoom: Math.max(fit, vp.height / 34) };
  const organe = machineModel(m, useProject.getState().perso[m.id]).organes.find((o) => o.id === f.organeId);
  const p = rotate(m, organe?.position ?? [0, 1, 0.3]);
  return { center: [p[0], p[2]], zoom: Math.max(fit, vp.height / 12) };
}

export function CameraRig({ frame, center, size, view }: { frame: Frame; center: XY; size: XY; view: View }) {
  const ref = useRef<CameraControls>(null);
  const { camera, size: vp } = useThree();
  const nonce = useUi((s) => s.focusNonce);
  const dragging = useSceneUi((s) => s.dragging);
  const zoneTool = useUi((s) => s.zoneTool);
  const prev = useRef<CameraFocus>({ kind: 'site' });
  const running = useRef(0);
  const plan = view === '2d';
  const fit = planFit(size, vp);
  // À la bascule, la caméra par défaut (orthographique en 2D, perspective en 3D) n'est remplacée qu'après le premier
  // rendu : les contrôles ne sont créés qu'une fois la bonne caméra en place, sinon ils piloteraient l'ancienne.
  const ready = plan ? (camera as THREE.OrthographicCamera).isOrthographicCamera === true : (camera as THREE.PerspectiveCamera).isPerspectiveCamera === true;

  useEffect(() => {
    sceneHandle.controls = ref.current;
    sceneHandle.camera = camera;
    return () => {
      sceneHandle.controls = null;
    };
  }, [camera, ready]);

  useEffect(() => {
    sceneHandle.planTarget = (f) => planTarget(f, center, size, vp);
  }, [center[0], center[1], size[0], size[1], vp.width, vp.height]);

  const goTo = async (f: CameraFocus, animate: boolean) => {
    const c = ref.current;
    if (!c) return;
    const id = ++running.current;
    // Focus d'origine noté dès le départ : la fin d'une transition (« repos » de camera-controls) peut tarder,
    // et un nouveau focus ne doit pas repasser par la vue machine pour autant.
    const from = prev.current;
    prev.current = f;
    if (plan) {
      const t = planTarget(f, center, size, vp);
      c.smoothTime = 0.4;
      await Promise.all([c.setLookAt(t.center[0], PLAN_EYE, t.center[1] + 0.001, t.center[0], 0, t.center[1], animate), c.zoomTo(t.zoom, animate)]);
      return;
    }
    const machines = useProject.getState().machines;
    if (f.kind === 'site') {
      await c.setLookAt(...overviewPose(center, size), animate);
    } else {
      const m = machines.find((x) => x.id === f.machineId);
      if (!m) return;
      if (f.kind === 'machine') {
        if (from.kind === 'organe' && from.machineId === m.id) c.smoothTime = 0.45;
        await c.setLookAt(...machinePose(m, useUi.getState().step === 3), animate);
      } else {
        const organe = machineModel(m, useProject.getState().perso[m.id]).organes.find((o) => o.id === f.organeId);
        const pos = organe?.position ?? [0, 1, 0.3];
        // Zoom continu : plan → machine → organe, sans coupure.
        if (animate && (from.kind === 'site' || from.machineId !== m.id)) {
          c.smoothTime = 0.42;
          await c.setLookAt(...machinePose(m), true);
          if (id !== running.current) return;
        }
        c.smoothTime = 0.5;
        await c.setLookAt(...organPose(m, pos), animate);
      }
    }
    if (id === running.current) c.smoothTime = 0.55;
  };

  // Reprise du point de vue de la carte (étape 1 → 3D) ou du plan (2D → 3D), puis glissement vers la cible.
  const applyHandoff = (): boolean => {
    const c = ref.current;
    const fromPlan = planHandoff.current;
    planHandoff.current = null;
    if (!plan && fromPlan && c && !isReducedMotion()) {
      // Même cadrage qu'en 2D : vue de dessus à la distance qui donne la même échelle (champ vertical de 36,87°).
      const d = (vp.height / fromPlan.zoom) * 1.5;
      c.setLookAt(fromPlan.center[0], d, fromPlan.center[1] + 0.01, fromPlan.center[0], 0, fromPlan.center[1], false);
      handoff.snapshot = null;
      return true;
    }
    const snap = handoff.snapshot;
    handoff.snapshot = null;
    if (plan || !snap || isReducedMotion() || !c) return false;
    c.setLookAt(...poseFromMap(snap, frame), false);
    return true;
  };

  // Dernier focus traité : le montage (caméra prête) le prend en charge, les suivants rejouent une transition.
  const seen = useRef(-1);
  useEffect(() => {
    if (!ready) return;
    seen.current = useUi.getState().focusNonce;
    const focus = useUi.getState().focus;
    if (applyHandoff()) {
      const t = window.setTimeout(() => void goTo(focus, true), 120);
      return () => window.clearTimeout(t);
    }
    void goTo(focus, false);
  }, [ready]);

  useEffect(() => {
    // La scène reste montée d'une étape à l'autre : chaque nouveau focus rejoue la transition.
    if (!ready || seen.current === nonce) return;
    seen.current = nonce;
    if (applyHandoff()) {
      const t = window.setTimeout(() => void goTo(useUi.getState().focus, true), 650);
      return () => window.clearTimeout(t);
    }
    void goTo(useUi.getState().focus, !isReducedMotion());
  }, [nonce]);

  // Échelle du plan pour la barre d'échelle et le niveau de détail des étiquettes.
  const onChange = () => {
    if (!plan) return;
    const z = (camera as THREE.OrthographicCamera).zoom;
    const cur = useSceneUi.getState().planZoom;
    if (Math.abs(z - cur) / cur > 0.004) useSceneUi.getState().set({ planZoom: z });
  };

  if (!ready) return null;
  if (plan) {
    return (
      <CameraControls
        ref={ref}
        makeDefault
        minZoom={fit * 0.35}
        maxZoom={160}
        minPolarAngle={0}
        maxPolarAngle={0}
        minAzimuthAngle={0}
        maxAzimuthAngle={0}
        azimuthRotateSpeed={0}
        polarRotateSpeed={0}
        dollyToCursor
        mouseButtons={{ left: ACTION.TRUCK, middle: ACTION.ZOOM, right: ACTION.TRUCK, wheel: ACTION.ZOOM }}
        touches={{ one: ACTION.TOUCH_TRUCK, two: ACTION.TOUCH_ZOOM_TRUCK, three: ACTION.TOUCH_ZOOM_TRUCK }}
        smoothTime={0.4}
        draggingSmoothTime={0.06}
        enabled={!dragging && !zoneTool}
        onChange={onChange}
      />
    );
  }
  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={1.2}
      maxDistance={900}
      maxPolarAngle={Math.PI * 0.47}
      smoothTime={0.55}
      draggingSmoothTime={0.12}
      enabled={!dragging}
    />
  );
}
