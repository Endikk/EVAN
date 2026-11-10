/**
 * Machine seule en 3D pour revoir une panne : le modèle glTF du kit, animé selon l'état rejoué (rouleaux qui
 * ralentissent, voyants), l'organe en cause mis en évidence et balisé. On peut tourner autour.
 */
import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei';
import type { EtatMachine, Machine, Organe } from '@/domain/types';
import { MODEL_FOOTPRINT } from '@/domain/catalog';
import { useIsDark, useReducedMotion } from '@/store/ui';
import { ETAT_COULEUR } from '@/ui/status';
import { MachineModel } from '@/widgets/scene/MachineModel';
import { OrganBeacon } from '@/widgets/scene/OrganBeacon';

export function ReplayScene({ machine, organe, etat, facteur }: { machine: Machine; organe?: Organe; etat: EtatMachine; facteur: number }) {
  const dark = useIsDark();
  const reduced = useReducedMotion();
  const fp = MODEL_FOOTPRINT[machine.type] ?? MODEL_FOOTPRINT.custom;
  const cx = (fp.min[0] + fp.max[0]) / 2;
  const cz = (fp.min[1] + fp.max[1]) / 2;
  const size = Math.max(fp.max[0] - fp.min[0], fp.max[1] - fp.min[1]);
  // Vue de trois quarts, côté opérateur, cadrée sur la machine entière.
  const camera = useMemo(() => {
    const d = size * 1.05 + 1.5;
    return { fov: 30, near: 0.1, far: 200, position: [cx + d * 0.32, fp.h * 1.1 + size * 0.25, cz + d] as [number, number, number] };
  }, [cx, cz, size, fp.h]);
  // La caméra vise la machine, légèrement tirée vers l'organe en cause : on voit l'ensemble et l'organe reste central.
  const cible = useMemo<[number, number, number]>(() => {
    const centre: [number, number, number] = [cx, fp.h * 0.45, cz];
    const o = organe?.position;
    return o ? [centre[0] + (o[0] - centre[0]) * 0.3, centre[1] + (o[1] - centre[1]) * 0.3, centre[2] + (o[2] - centre[2]) * 0.3] : centre;
  }, [organe, cx, cz, fp.h]);
  const enDefaut = etat === 'panne' || etat === 'attention';

  return (
    <Canvas camera={camera} dpr={[1, 1.75]} gl={{ antialias: true }} style={{ touchAction: 'none' }}>
      <color attach="background" args={[dark ? '#060a14' : '#e3e0db']} />
      <hemisphereLight args={[dark ? '#c9d2e6' : '#ffffff', dark ? '#202024' : '#a9a8a2', dark ? 0.9 : 1.15]} />
      <directionalLight position={[6, 10, 7]} intensity={dark ? 1.6 : 2.2} />
      <directionalLight position={[-8, 5, -6]} intensity={0.45} />
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={2.4} position={[0, 8, 2]} rotation-x={Math.PI / 2} scale={[16, 8, 1]} />
        <Lightformer intensity={1.4} position={[-10, 3, 6]} rotation-y={Math.PI / 3} scale={[10, 4, 1]} color="#fff6e0" />
        <Lightformer intensity={1.1} position={[10, 3, -4]} rotation-y={-Math.PI / 2} scale={[10, 4, 1]} color="#e3ecff" />
      </Environment>
      <Suspense fallback={null}>
        <MachineModel
          url={machine.modele.url}
          etat={etat}
          facteur={facteur}
          reduced={reduced}
          focus={organe ? { numero: organe.numero, kind: enDefaut ? 'defaut' : 'selection' } : undefined}
          ghost={0.42}
        />
      </Suspense>
      {organe?.position && <OrganBeacon position={organe.position} color={enDefaut ? ETAT_COULEUR[etat] : '#ff7a3d'} />}
      <ContactShadows position={[cx, 0.001, cz]} opacity={dark ? 0.55 : 0.35} scale={size * 1.6} blur={2.4} far={3} />
      <OrbitControls target={cible} enablePan={false} minDistance={size * 0.45} maxDistance={size * 3} maxPolarAngle={Math.PI * 0.49} enableDamping />
    </Canvas>
  );
}
