/**
 * Zones sur le plan (étape 2), dans la scène elle-même (2D vue de dessus comme 3D) :
 *  - tracé : un type de zone choisi, on glisse un rectangle au sol, aimanté au mètre, cotes en direct ;
 *  - édition : la zone sélectionnée se déplace en la glissant, ses coins se tirent (un rectangle reste rectangle).
 */
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import type { TypeZone, Zone } from '@/domain/types';
import { formatArea, formatNumber, signedArea, type XY } from '@/geo/geodesy';
import { addZoneFromPolygon } from './zones';
import { ZONE_COULEUR } from './Zones3D';
import { sceneHandle, snap, useSceneUi } from './sceneState';
import { groundPointFromClient, worldPerPixel } from './sol';
import { useDispose } from './useDispose';

const rectOf = (a: XY, b: XY): XY[] => [
  [Math.min(a[0], b[0]), Math.min(a[1], b[1])],
  [Math.max(a[0], b[0]), Math.min(a[1], b[1])],
  [Math.max(a[0], b[0]), Math.max(a[1], b[1])],
  [Math.min(a[0], b[0]), Math.max(a[1], b[1])],
];

/** Suit un glisser à la souris ou au doigt hors de React (fenêtre), caméra coupée pendant le geste. */
function dragOnWindow(onMove: (p: XY, ev: PointerEvent) => void, onUp: () => void) {
  if (sceneHandle.controls) sceneHandle.controls.enabled = false;
  useSceneUi.getState().set({ dragging: true });
  const move = (ev: PointerEvent) => {
    const p = groundPointFromClient(ev.clientX, ev.clientY);
    if (p) onMove(p, ev);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (sceneHandle.controls) sceneHandle.controls.enabled = true;
    useSceneUi.getState().set({ dragging: false });
    onUp();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

/** Cotes du rectangle en cours. Toujours monté (masqué au repos) : démonter un <Html> en plein rendu casse son portail. */
function Dims({ poly, color }: { poly: XY[] | null; color: string }) {
  const q = poly ?? [[0, 0]];
  const xs = q.map((p) => p[0]);
  const zs = q.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...zs) - Math.min(...zs);
  return (
    <Html position={[(Math.min(...xs) + Math.max(...xs)) / 2, 0.3, Math.max(...zs) + 0.5]} zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
      <div className="dims2d" style={{ ['--c' as string]: color, visibility: poly ? 'visible' : 'hidden' }}>
        {formatNumber(w, 1)} × {formatNumber(d, 1)} m · {formatArea(poly ? Math.abs(signedArea(poly)) : 0)}
      </div>
    </Html>
  );
}

/** Géométrie plane d'un polygone, recréée seulement quand il change et libérée ensuite (tracé à la souris). */
function usePolygonGeometry(poly: XY[]) {
  const geom = useMemo(() => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z))));
    g.rotateX(-Math.PI / 2);
    return g;
  }, [poly]);
  return useDispose(geom);
}

function RectPreview({ poly, color }: { poly: XY[]; color: string }) {
  const geom = usePolygonGeometry(poly);
  return (
    <group>
      <mesh geometry={geom} position={[0, 0.2, 0]}>
        <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <Line points={[...poly, poly[0]].map(([x, z]) => [x, 0.22, z] as [number, number, number])} color={color} lineWidth={2} />
    </group>
  );
}

/** Tracé d'une zone rectangulaire (outil actif). Reste monté, inerte sans outil. */
export function ZoneDrawer({ type, center, size }: { type: TypeZone | null; center: XY; size: XY }) {
  const [rect, setRect] = useState<XY[] | null>(null);
  const color = type ? ZONE_COULEUR[type] : '#888';
  const down = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || !type) return;
    e.stopPropagation();
    const p0 = groundPointFromClient(e.clientX, e.clientY);
    if (!p0) return;
    const a: XY = [snap(p0[0], 1), snap(p0[1], 1)];
    let poly = rectOf(a, a);
    setRect(poly);
    dragOnWindow(
      (p) => {
        poly = rectOf(a, [snap(p[0], 1), snap(p[1], 1)]);
        setRect(poly);
      },
      () => {
        setRect(null);
        const w = poly[1][0] - poly[0][0];
        const d = poly[2][1] - poly[1][1];
        if (w >= 2 && d >= 2) {
          addZoneFromPolygon(poly, type);
          useUi.getState().setZoneTool(null);
          document.body.style.cursor = '';
        }
      },
    );
  };
  return (
    <group>
      {type && (
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center[0], 30, center[1]]}
        visible={false}
        onPointerDown={down}
        onPointerOver={() => (document.body.style.cursor = 'crosshair')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <planeGeometry args={[size[0] + 300, size[1] + 300]} />
        <meshBasicMaterial />
      </mesh>
      )}
      {rect && <RectPreview poly={rect} color={color} />}
      <Dims poly={rect} color={color} />
    </group>
  );
}

function Corner({ p, color, onDown }: { p: XY; color: string; onDown(e: ThreeEvent<PointerEvent>): void }) {
  const ref = useRef<THREE.Group>(null);
  const [hover, setHover] = useState(false);
  const height = useThree((s) => s.size.height);
  const at = useRef(new THREE.Vector3());
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g) return;
    g.getWorldPosition(at.current);
    g.scale.setScalar(((hover ? 9 : 7.5) * worldPerPixel(camera, at.current, height)) / 0.5);
  });
  return (
    <group
      ref={ref}
      position={[p[0], 0.4, p[1]]}
      onPointerDown={onDown}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'nwse-resize';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {/* Dessinées en dernier, par-dessus la dalle et les zones (transparentes elles aussi). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={20}>
        <circleGeometry args={[0.5, 24]} />
        <meshBasicMaterial color="#ffffff" transparent depthTest={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={21}>
        <ringGeometry args={[0.34, 0.5, 24]} />
        <meshBasicMaterial color={color} transparent depthTest={false} />
      </mesh>
      {/* Zone de prise élargie. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <circleGeometry args={[1.1, 12]} />
        <meshBasicMaterial />
      </mesh>
    </group>
  );
}

/** Coins et déplacement de la zone sélectionnée. Reste monté, inerte sans zone. */
export function ZoneHandles({ zone }: { zone?: Zone }) {
  const [live, setLive] = useState<XY[] | null>(null);
  return (
    <group>
      {zone && <ZoneHandlesFor zone={zone} live={live} setLive={setLive} />}
      <Dims poly={live} color={zone ? ZONE_COULEUR[zone.type] : '#888'} />
    </group>
  );
}

function ZoneHandlesFor({ zone, live, setLive }: { zone: Zone; live: XY[] | null; setLive(p: XY[] | null): void }) {
  const color = ZONE_COULEUR[zone.type];
  const poly = live ?? zone.polygone;

  const startCorner = (index: number) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const base = zone.polygone;
    let cur = base;
    dragOnWindow(
      (p) => {
        const np: XY = [snap(p[0], 0.5), snap(p[1], 0.5)];
        const next = base.map((q, i) => (i === index ? np : q));
        // Un rectangle reste rectangle : les deux sommets voisins suivent sur leur axe commun.
        if (base.length === 4) {
          const prev = (index + 3) % 4;
          const nxt = (index + 1) % 4;
          next[prev] = base[prev][0] === base[index][0] ? [np[0], base[prev][1]] : [base[prev][0], np[1]];
          next[nxt] = base[nxt][0] === base[index][0] ? [np[0], base[nxt][1]] : [base[nxt][0], np[1]];
        }
        cur = next;
        setLive(next);
      },
      () => {
        setLive(null);
        if (cur !== base) useProject.getState().updateZone(zone.id, { polygone: cur });
      },
    );
  };

  const startMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p0 = groundPointFromClient(e.clientX, e.clientY);
    if (!p0) return;
    const base = zone.polygone;
    let cur = base;
    document.body.style.cursor = 'grabbing';
    dragOnWindow(
      (p) => {
        const dx = snap(p[0] - p0[0], 0.5);
        const dz = snap(p[1] - p0[1], 0.5);
        cur = base.map(([x, z]) => [x + dx, z + dz] as XY);
        setLive(cur);
      },
      () => {
        setLive(null);
        document.body.style.cursor = '';
        if (cur !== base) useProject.getState().updateZone(zone.id, { polygone: cur });
      },
    );
  };

  const geom = usePolygonGeometry(poly);
  return (
    <group>
      {/* Corps de la zone : glisser pour la déplacer. */}
      <mesh
        geometry={geom}
        position={[0, 0.15, 0]}
        visible={false}
        onPointerDown={startMove}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'move';
        }}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <meshBasicMaterial />
      </mesh>
      {live && <RectPreview poly={live} color={color} />}
      {poly.map((p, i) => (
        <Corner key={i} p={p} color={color} onDown={startCorner(i)} />
      ))}
    </group>
  );
}
