/** Sol de la scène 3D : orthophoto composée autour du site, dans le même repère que la carte. */
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { composeGround, type GroundImage } from '@/geo/tiles';
import type { Frame, XY } from '@/geo/geodesy';
import { useSceneUi } from './sceneState';
import { useDispose } from './useDispose';

export function SatelliteGround({ frame, center, half, dark, visible = true }: { frame: Frame; center: XY; half: XY; dark: boolean; visible?: boolean }) {
  const [img, setImg] = useState<GroundImage | null>(null);
  const key = `${frame.origin.join(',')}|${frame.angleDeg}|${center.map((v) => Math.round(v)).join(',')}|${half.map((v) => Math.round(v)).join(',')}`;

  useEffect(() => {
    let alive = true;
    useSceneUi.getState().set({ groundReady: false });
    composeGround(frame, center, half, 90).then((g) => {
      if (!alive) return;
      setImg(g);
      useSceneUi.getState().set({ groundReady: true });
    });
    return () => {
      alive = false;
    };
  }, [key]);

  const geom = useMemo(() => {
    if (!img) return null;
    const [tl, tr, br, bl] = img.corners;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([tl[0], 0, tl[1], tr[0], 0, tr[1], br[0], 0, br[1], bl[0], 0, bl[1]], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 0], 2));
    g.setIndex([0, 3, 1, 1, 3, 2]);
    g.computeVertexNormals();
    return g;
  }, [img]);

  const tex = useMemo(() => {
    if (!img) return null;
    const t = new THREE.CanvasTexture(img.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [img]);
  // Texture jusqu'à environ 3000 × 3000 px : sans libération, chaque usine visitée la laisse en mémoire graphique.
  useDispose(geom);
  useDispose(tex);

  if (!geom || !tex) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], -0.02, center[1]]} visible={visible}>
        <planeGeometry args={[half[0] * 2 + 180, half[1] * 2 + 180]} />
        <meshStandardMaterial color={dark ? '#1a1f28' : '#9aa19a'} roughness={1} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={4} />
      </mesh>
    );
  }
  // La nuit, la photo est éclairée et assombrie avec la scène. Le jour, elle garde ses couleurs : éclairée par les
  // mêmes lumières que les machines, elle sortait délavée, presque blanche.
  // Repoussée en profondeur (polygonOffset) : vue de loin, la photo à -2 cm ne se bat plus avec la dalle du bâtiment.
  return (
    <mesh geometry={geom} position={[0, -0.02, 0]} visible={visible}>
      {dark ? (
        <meshStandardMaterial map={tex} roughness={1} metalness={0} color="#8f97a3" polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={4} />
      ) : (
        <meshBasicMaterial map={tex} toneMapped={false} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={4} />
      )}
    </mesh>
  );
}
