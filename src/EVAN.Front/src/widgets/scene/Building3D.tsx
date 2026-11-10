/**
 * Plan 3D généré : extrusion du contour (sol, murs, hauteur réglable) avec murs « en coupe » :
 * les murs tournés vers la caméra s'effacent pour laisser voir l'intérieur.
 * Sur le plan 2D (vue de dessus), le bâtiment devient une dalle claire cernée d'un trait de mur net, avec ses cotes.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { Batiment } from '@/domain/types';
import { formatNumber, pointInPolygon, polygonCentroid, toLocal, type Frame, type XY } from '@/geo/geodesy';
import { isReducedMotion } from '@/store/ui';
import { useDispose } from './useDispose';

const WALL_T = 0.3;

export function useLocalRing(b: Batiment, frame: Frame): XY[] {
  return useMemo(() => b.contour.map((p) => toLocal(frame, p)), [b.contour, frame]);
}

interface Props {
  b: Batiment;
  frame: Frame;
  dark: boolean;
  highlight?: boolean;
  /** Plan 2D vu de dessus. */
  plan?: boolean;
  /** Fond satellite sous le plan : dalle translucide. */
  satellite?: boolean;
  /** Cotes des murs (plan 2D, étiquettes affichées). */
  cotes?: boolean;
  /** Plan zoomé : cotes des murs courts aussi. */
  detail?: boolean;
  /** Contours des autres bâtiments : pas de cote sur un mur mitoyen (elle tomberait chez le voisin). */
  others?: XY[][];
}

export function Building3D({ b, frame, dark, highlight, plan = false, satellite = false, cotes = false, detail = false, others = [] }: Props) {
  const pts = useLocalRing(b, frame);
  const rise = useRef(isReducedMotion() ? 1 : 0);
  const group = useRef<THREE.Group>(null);
  const wallRefs = useRef<(THREE.Mesh | null)[]>([]);

  const floorGeom = useMemo(() => {
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [pts]);

  const walls = useMemo(() => {
    const c = polygonCentroid(pts);
    return pts.map((a, i) => {
      const bb = pts[(i + 1) % pts.length];
      const dx = bb[0] - a[0];
      const dz = bb[1] - a[1];
      const len = Math.hypot(dx, dz);
      const mid: XY = [(a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2];
      let nx = dz / (len || 1);
      let nz = -dx / (len || 1);
      // Normale sortante : opposée au centroïde.
      if ((mid[0] - c[0]) * nx + (mid[1] - c[1]) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      return { len, mid, angle: -Math.atan2(dz, dx), normal: new THREE.Vector3(nx, 0, nz), a, b: bb };
    });
  }, [pts]);

  useEffect(() => {
    rise.current = isReducedMotion() ? 1 : 0;
  }, [b.id]);

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: dark ? '#4a5568' : '#d7dde6',
        roughness: 0.85,
        metalness: 0.05,
        transparent: true,
        opacity: 0.9,
      }),
    [dark],
  );
  const wallMats = useMemo(() => walls.map(() => wallMat.clone()), [walls, wallMat]);
  const floorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: dark ? '#232a35' : '#b9c0c9', roughness: 0.95, metalness: 0, transparent: true, opacity: 0.94 }),
    [dark],
  );
  // Dalle du plan : couleur unie non éclairée (aplat net), translucide sur l'orthophoto.
  const planMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: dark ? '#18202c' : '#ffffff', transparent: true, opacity: satellite ? 0.5 : 1, depthWrite: false }),
    [dark, satellite],
  );

  useDispose(floorGeom);
  useDispose(wallMat);
  useDispose(wallMats);
  useDispose(floorMat);
  useDispose(planMat);

  const camDir = useMemo(() => new THREE.Vector3(), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }, dt) => {
    if (rise.current < 1) rise.current = Math.min(1, rise.current + dt / 1.4);
    const k = 1 - (1 - rise.current) ** 3;
    const h = Math.max(0.05, b.hauteur * k);
    walls.forEach((w, i) => {
      const mesh = wallRefs.current[i];
      if (!mesh) return;
      mesh.scale.y = h;
      mesh.position.y = h / 2;
      // Mur entre la caméra et l'intérieur → transparent (vue « maison de poupée »).
      tmp.set(w.mid[0], h / 2, w.mid[1]);
      camDir.copy(camera.position).sub(tmp).setY(0).normalize();
      const facing = camDir.dot(w.normal);
      const target = facing > 0.15 ? 0.1 : 0.88;
      const mat = wallMats[i];
      mat.opacity += (target - mat.opacity) * Math.min(1, dt * 6);
      mat.depthWrite = mat.opacity > 0.5;
    });
  });

  const ink = dark ? '#c9d3e3' : '#2c3442';
  // Cotes toujours montées (masquées hors plan) : démonter un <Html> pendant un rendu casse son portail.
  const cotesEls = walls.map((w, i) => {
    if (w.len < 3) return null;
    // À l'extérieur du mur, texte dans le sens du mur et jamais à l'envers.
    const p: [number, number, number] = [w.mid[0] + w.normal.x * 2.6, 0.1, w.mid[1] + w.normal.z * 2.6];
    const mitoyen = others.some((r) => pointInPolygon([p[0], p[2]], r));
    const visible = plan && cotes && !mitoyen && (w.len >= 10 || detail);
    let deg = (-w.angle * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
    return (
      <Html key={`c${i}`} position={p} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <div className="cote2d" style={{ transform: `rotate(${deg}deg)`, visibility: visible ? 'visible' : 'hidden' }}>
          {formatNumber(w.len, 1)} m
        </div>
      </Html>
    );
  });

  // Même arbre en 2D et en 3D (seuls les réglages changent) : rien n'est démonté à la bascule.
  return (
    <group ref={group}>
      <mesh geometry={floorGeom} material={plan ? planMat : floorMat} position={[0, plan ? 0.012 : 0.015, 0]} />
      <group visible={!plan}>
        {walls.map((w, i) => (
          <mesh
            key={i}
            ref={(m) => {
              wallRefs.current[i] = m;
            }}
            position={[w.mid[0], b.hauteur / 2, w.mid[1]]}
            rotation={[0, w.angle, 0]}
            material={wallMats[i]}
          >
            <boxGeometry args={[w.len + WALL_T, 1, WALL_T]} />
          </mesh>
        ))}
      </group>
      {/* Pied de mur ; sur le plan, trait de mur à épaisseur constante à l'écran. */}
      <Line
        points={[...pts, pts[0]].map(([x, z]) => [x, plan ? 0.09 : 0.05, z] as [number, number, number])}
        color={plan ? ink : highlight ? '#ff7a3d' : dark ? '#7f8ba0' : '#5d6878'}
        lineWidth={plan ? 3.2 : highlight ? 2.5 : 1.4}
      />
      <Line
        points={[...pts, pts[0]].map(([x, z]) => [x, b.hauteur + 0.02, z] as [number, number, number])}
        color={dark ? '#5b6679' : '#9aa5b5'}
        lineWidth={1}
        transparent
        opacity={0.6}
        visible={!plan}
      />
      {cotesEls}
    </group>
  );
}
