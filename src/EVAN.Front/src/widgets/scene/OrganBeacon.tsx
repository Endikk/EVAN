/**
 * Balise d'un organe ciblé (panne ou sélection) : point et anneau pulsé face à la caméra, carte HTML facultative.
 * Partagée par le plan de l'usine et la scène du rejeu, dans son propre fichier pour que le rejeu ne tire pas tout le
 * plan avec lui.
 */
import { useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useReducedMotion } from '@/store/ui';

export function OrganBeacon({ position, color, children }: { position: [number, number, number]; color: string; children?: ReactNode }) {
  const reduced = useReducedMotion();
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ring.current) return;
    const k = reduced ? 0.5 : (state.clock.elapsedTime % 1.1) / 1.1;
    ring.current.scale.setScalar(0.7 + k * 1.2);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = reduced ? 0.8 : 0.9 * (1 - k);
    ring.current.quaternion.copy(state.camera.quaternion);
  });
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.035, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} />
      </mesh>
      <mesh ref={ring}>
        <torusGeometry args={[0.22, 0.018, 12, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthTest={false} />
      </mesh>
      {children && (
        <Html position={[0.25, 0.35, 0]} zIndexRange={[40, 30]} style={{ pointerEvents: 'auto' }}>
          {children}
        </Html>
      )}
    </group>
  );
}
