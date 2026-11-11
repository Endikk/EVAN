/**
 * Poignées de rotation aux coins d'une machine sélectionnée (étapes de configuration) : au survol d'un coin,
 * le curseur devient une flèche circulaire ; on attrape le coin et on fait pivoter la machine autour de son centre,
 * aimantée tous les 15° (Alt : au degré près). Un simple appui la fait pivoter d'un quart de tour.
 * Poignées en 3D (pas de DOM) : elles suivent la machine, gardent la même taille à l'écran en 3D comme sur
 * le plan 2D, et restent attrapables au doigt.
 */
import { useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import type { Machine } from '@/domain/types';
import { ROTATE_CURSOR, sceneHandle, snapAngle, useSceneUi } from './sceneState';
import { groundPointFromClient, worldPerPixel } from './sol';
import { ENCRE, useCouleurSelection } from './couleurs';

interface Props {
  machine: Machine;
  footprint: { min: [number, number]; max: [number, number]; h: number };
  group: React.RefObject<THREE.Group | null>;
  onRotate(id: string, deg: number): void;
}

const R2D = 180 / Math.PI;

/** Rayon de la poignée à l'écran (px) et plafond en mètres (elle ne doit pas masquer une petite machine). */
const HANDLE_PX = 13;
const HANDLE_MAX_M = 0.9;

/**
 * Poignée : une pastille blanche portant une flèche à l'encre (lisible dans les deux thèmes), cerclée de la couleur
 * de sélection (ivoire la nuit, encre le jour) pour se détacher de la dalle comme de la photo.
 */
function Handle({ x, z, onDown }: { x: number; z: number; onDown(e: ThreeEvent<PointerEvent>): void }) {
  const [hover, setHover] = useState(false);
  const selection = useCouleurSelection();
  const ref = useRef<THREE.Group>(null);
  const world = useRef(new THREE.Vector3());
  const height = useThree((s) => s.size.height);
  // Taille constante à l'écran : la poignée reste attrapable en vue d'ensemble, de près et sur le plan 2D.
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    g.getWorldPosition(world.current);
    const r = Math.min(HANDLE_MAX_M, HANDLE_PX * worldPerPixel(camera, world.current, height));
    g.scale.setScalar((r / 0.34) * (hover ? 1.18 : 1));
  });
  return (
    <group
      ref={ref}
      position={[x, 0.1, z]}
      onPointerDown={onDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = ROTATE_CURSOR;
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {/* Zone de prise bien plus large que le dessin : elle couvre le coin de la machine (souris et doigt). */}
      <mesh visible={false}>
        <cylinderGeometry args={[0.95, 0.95, 0.6, 20]} />
        <meshBasicMaterial />
      </mesh>
      <mesh>
        <cylinderGeometry args={[0.34, 0.34, 0.1, 32]} />
        <meshStandardMaterial color="#ffffff" roughness={0.4} />
      </mesh>
      {/* Flèche circulaire : arc de 270° et pointe. */}
      <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.2, 0.035, 8, 32, Math.PI * 1.5]} />
        <meshBasicMaterial color={ENCRE} />
      </mesh>
      <mesh position={[0.2, 0.07, 0.05]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.07, 0.13, 3]} />
        <meshBasicMaterial color={ENCRE} />
      </mesh>
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.34, 0.4, 32]} />
        <meshBasicMaterial color={selection} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

export function RotationHandles({ machine, footprint, group, onRotate }: Props) {
  const rotating = useSceneUi((s) => s.rotating?.id === machine.id);
  const selection = useCouleurSelection();
  const m = 0.6;
  const corners: [number, number][] = [
    [footprint.min[0] - m, footprint.min[1] - m],
    [footprint.max[0] + m, footprint.min[1] - m],
    [footprint.max[0] + m, footprint.max[1] + m],
    [footprint.min[0] - m, footprint.max[1] + m],
  ];
  const cx = (footprint.min[0] + footprint.max[0]) / 2;
  const cz = (footprint.min[1] + footprint.max[1]) / 2;
  const radius = Math.hypot(footprint.max[0] - footprint.min[0], footprint.max[1] - footprint.min[1]) / 2 + 0.85;

  const start = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const center = machine.position;
    const p0 = groundPointFromClient(e.clientX, e.clientY);
    if (!p0) return;
    const a0 = Math.atan2(p0[1] - center[1], p0[0] - center[0]);
    const deg0 = machine.rotationDeg;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    let current = deg0;
    useSceneUi.getState().set({ dragging: true, rotating: { id: machine.id, numero: machine.numero, deg: deg0 } });
    document.body.style.cursor = ROTATE_CURSOR;
    // Coupe tout de suite l'orbite de la caméra (sans attendre le rendu React).
    if (sceneHandle.controls) sceneHandle.controls.enabled = false;

    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      moved = true;
      const p = groundPointFromClient(ev.clientX, ev.clientY);
      if (!p) return;
      const a = Math.atan2(p[1] - center[1], p[0] - center[0]);
      current = snapAngle(deg0 + (a - a0) * R2D, ev.altKey ? 1 : 15);
      if (group.current) group.current.rotation.y = (-current * Math.PI) / 180;
      useSceneUi.getState().set({ rotating: { id: machine.id, numero: machine.numero, deg: current } });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
      if (sceneHandle.controls) sceneHandle.controls.enabled = true;
      useSceneUi.getState().set({ dragging: false, rotating: undefined });
      onRotate(machine.id, moved ? current : snapAngle(deg0 + 90, 90));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return (
    <group>
      {/* Cercle de rotation au sol, plus marqué pendant le geste. */}
      <mesh position={[cx, 0.06, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius - 0.05, radius + 0.05, 96]} />
        <meshBasicMaterial color={selection} transparent opacity={rotating ? 0.95 : 0.45} depthWrite={false} />
      </mesh>
      {/* Sens de la machine (vers +x local) : triangle au sol. */}
      <mesh position={[footprint.max[0] + 1.05, 0.07, cz]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
        <circleGeometry args={[0.32, 3]} />
        <meshBasicMaterial color={selection} transparent opacity={0.9} depthWrite={false} />
      </mesh>
      {corners.map(([x, z], i) => (
        <Handle key={i} x={x} z={z} onDown={start} />
      ))}
    </group>
  );
}
