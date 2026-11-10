/**
 * Une machine sur le plan 3D : modèle glTF animé selon l'état (rouleaux, bande, voyants),
 * marqueur d'état au sol (couleur + forme + pulsation), étiquette, glisser-déposer en édition,
 * mise en évidence de l'organe ciblé.
 */
import { memo, Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import type { EtatMachine, Machine } from '@/domain/types';
import { MODEL_FOOTPRINT } from '@/domain/catalog';
import { ETAT_COULEUR, LIBELLE_HORS_LIGNE, StatusIcon } from '@/ui/status';
import { MachineModel, type OrganFocus } from './MachineModel';
import { sceneHandle, snap, useSceneUi } from './sceneState';
import { RotationHandles } from './RotationHandles';
import type { XY } from '@/geo/geodesy';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

export type { OrganFocus };

interface Props {
  machine: Machine;
  etat: EtatMachine;
  /** Lu à chaque image par le modèle : un changement de vitesse ne re-rend pas la machine. */
  facteur: number | (() => number);
  /** Plus aucune donnée de la machine : étiquette « Liaison perdue ». */
  horsLigne?: boolean;
  selected: boolean;
  focus?: OrganFocus;
  /** Déplacement à la souris (étape 3). */
  editable: boolean;
  /** Poignées de rotation sur la machine sélectionnée (étapes de configuration 3 à 5). */
  rotatable: boolean;
  /** Plan 2D vu de dessus : étiquette compacte sous la machine. */
  plan: boolean;
  /** Plan 2D assez zoomé pour afficher le nom. */
  detail: boolean;
  showTag: boolean;
  reduced: boolean;
  code?: string;
  onSelect(id: string): void;
  onMove?(id: string, pos: XY): void;
  onRotate?(id: string, deg: number): void;
  isValid?(pos: XY): boolean;
}

const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function StatusMarker({ etat, w, d, cx, cz, reduced, close }: { etat: EtatMachine; w: number; d: number; cx: number; cz: number; reduced: boolean; close: boolean }) {
  const color = ETAT_COULEUR[etat];
  const ring = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const fill = useRef<THREE.MeshBasicMaterial>(null);
  const r = Math.hypot(w, d) / 2 + 0.4;
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ring.current) {
      const k = reduced ? 0.4 : (t % 1.25) / 1.25;
      ring.current.scale.setScalar(1 + k * 1.1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = reduced ? 0.5 : 0.7 * (1 - k);
    }
    if (beam.current) (beam.current.material as THREE.MeshBasicMaterial).opacity = reduced ? 0.22 : 0.12 + 0.14 * (0.5 + 0.5 * Math.sin(t * 6));
    if (fill.current && etat === 'attention') fill.current.opacity = reduced ? 0.2 : 0.1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 3));
  });
  const hw = w / 2 + 0.35;
  const hd = d / 2 + 0.35;
  const rect: [number, number, number][] = [
    [cx - hw, 0.05, cz - hd],
    [cx + hw, 0.05, cz - hd],
    [cx + hw, 0.05, cz + hd],
    [cx - hw, 0.05, cz + hd],
    [cx - hw, 0.05, cz - hd],
  ];
  return (
    <group>
      <mesh position={[cx, 0.04, cz]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[hw * 2, hd * 2]} />
        <meshBasicMaterial ref={fill} color={color} transparent opacity={close ? 0.06 : etat === 'panne' ? 0.3 : 0.14} depthWrite={false} />
      </mesh>
      <Line points={rect} color={color} lineWidth={etat === 'panne' ? 3 : 2} dashed={etat === 'arret'} dashSize={0.5} gapSize={0.35} />
      {etat === 'panne' && !close && (
        <>
          <mesh ref={ring} position={[cx, 0.06, cz]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[r, r + 0.35, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} />
          </mesh>
          <mesh ref={beam} position={[cx, 7, cz]}>
            <cylinderGeometry args={[0.55, 1.4, 14, 24, 1, true]} />
            <meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
          </mesh>
        </>
      )}
    </group>
  );
}

function Machine3DImpl(p: Props) {
  const { machine, etat, facteur, horsLigne, selected, focus, editable, rotatable, plan, detail, showTag, reduced, code, onSelect, onMove, onRotate, isValid } = p;
  const group = useRef<THREE.Group>(null);
  const dragging = useRef<{ offset: XY; pos: XY } | null>(null);
  const fp = MODEL_FOOTPRINT[machine.type] ?? MODEL_FOOTPRINT.custom;
  const w = fp.max[0] - fp.min[0];
  const d = fp.max[1] - fp.min[1];
  const cx = (fp.max[0] + fp.min[0]) / 2;
  const cz = (fp.max[1] + fp.min[1]) / 2;
  const hit = useMemo(() => new THREE.Vector3(), []);
  const hover = useSceneUi((s) => s.hoverMachineId === machine.id);
  // Plan 2D : étiquette centrée sous l'emprise, quelle que soit la rotation (calcul en coordonnées monde puis retour au local).
  const tag2d = useMemo(() => {
    const a = (-machine.rotationDeg * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pts = [fp.min, [fp.max[0], fp.min[1]], fp.max, [fp.min[0], fp.max[1]]].map(([x, z]) => [x * ca + z * sa, -x * sa + z * ca]);
    const wx = (Math.min(...pts.map((q) => q[0])) + Math.max(...pts.map((q) => q[0]))) / 2;
    const wz = Math.max(...pts.map((q) => q[1])) + 0.45;
    return [wx * ca - wz * sa, fp.h + 0.2, wx * sa + wz * ca] as [number, number, number];
  }, [machine.rotationDeg, fp]);

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onSelect(machine.id);
    if (!editable || !onMove) return;
    if (!e.ray.intersectPlane(GROUND, hit)) return;
    dragging.current = { offset: [machine.position[0] - hit.x, machine.position[1] - hit.z], pos: machine.position };
    (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
    if (sceneHandle.controls) sceneHandle.controls.enabled = false;
    useSceneUi.getState().set({ dragging: true });
  };
  const move = (e: ThreeEvent<PointerEvent>) => {
    const dr = dragging.current;
    if (!dr || !group.current) return;
    if (!e.ray.intersectPlane(GROUND, hit)) return;
    const pos: XY = [snap(hit.x + dr.offset[0]), snap(hit.z + dr.offset[1])];
    dr.pos = pos;
    group.current.position.set(pos[0], 0, pos[1]);
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    const dr = dragging.current;
    if (!dr) return;
    (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
    dragging.current = null;
    if (sceneHandle.controls) sceneHandle.controls.enabled = true;
    useSceneUi.getState().set({ dragging: false });
    if (isValid && !isValid(dr.pos)) {
      group.current?.position.set(machine.position[0], 0, machine.position[1]);
      return;
    }
    onMove?.(machine.id, dr.pos);
  };

  return (
    <group
      ref={group}
      position={[machine.position[0], 0, machine.position[1]]}
      rotation={[0, (-machine.rotationDeg * Math.PI) / 180, 0]}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = editable ? 'grab' : 'pointer';
        useSceneUi.getState().set({ hoverMachineId: machine.id });
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
        useSceneUi.getState().set({ hoverMachineId: undefined });
      }}
    >
      {/* Suspense par machine : le chargement d'un modèle ne démonte pas les autres (ni leurs étiquettes). */}
      {/* Modèle illisible (import corrompu, réseau) : un volume à l'emprise de la machine, le reste de la scène continue. */}
      <ErrorBoundary
        label={`Modèle 3D de ${machine.numero}`}
        resetKey={machine.modele.url}
        fallback={
          <mesh position={[cx, fp.h / 2, cz]}>
            <boxGeometry args={[w, fp.h, d]} />
            <meshStandardMaterial color={ETAT_COULEUR.arret} transparent opacity={0.55} />
          </mesh>
        }
      >
        <Suspense fallback={null}>
          <MachineModel url={machine.modele.url} etat={etat} facteur={facteur} focus={focus} reduced={reduced} detail="auto" />
        </Suspense>
      </ErrorBoundary>
      <StatusMarker etat={etat} w={w} d={d} cx={cx} cz={cz} reduced={reduced} close={!!focus} />
      {selected && rotatable && onRotate && <RotationHandles machine={machine} footprint={fp} group={group} onRotate={onRotate} />}
      {selected && (
        <Line
          points={[
            [cx - w / 2 - 0.7, 0.07, cz - d / 2 - 0.7],
            [cx + w / 2 + 0.7, 0.07, cz - d / 2 - 0.7],
            [cx + w / 2 + 0.7, 0.07, cz + d / 2 + 0.7],
            [cx - w / 2 - 0.7, 0.07, cz + d / 2 + 0.7],
            [cx - w / 2 - 0.7, 0.07, cz - d / 2 - 0.7],
          ]}
          color="#ff7a3d"
          lineWidth={2.5}
        />
      )}
      <Html position={plan ? tag2d : [cx, fp.h + 0.9, cz]} center={!plan} zIndexRange={[20, 10]} style={{ pointerEvents: showTag ? 'auto' : 'none' }}>
        {plan ? (
          <div
            className={`tag2d st-${etat} ${selected ? 'sel' : ''}`}
            style={{ ['--c' as string]: ETAT_COULEUR[etat], visibility: showTag ? 'visible' : 'hidden' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(machine.id);
            }}
          >
            <StatusIcon etat={etat} size={9} animate={!reduced} />
            <b>{machine.numero}</b>
            {horsLigne ? (
              <small>{LIBELLE_HORS_LIGNE}</small>
            ) : (
              (detail || selected || hover || (etat === 'panne' && code)) && <small>{etat === 'panne' && code ? code : machine.nom}</small>
            )}
          </div>
        ) : (
          <div
            className={`tag3d st st-${etat} ${etat === 'panne' ? 'panne' : ''} ${selected ? 'sel' : ''}`}
            style={{ ['--c' as string]: ETAT_COULEUR[etat], visibility: showTag ? 'visible' : 'hidden' }}
            onPointerDown={(e) => {
              e.stopPropagation();
              onSelect(machine.id);
            }}
          >
            <StatusIcon etat={etat} size={11} animate={!reduced} />
            <span>{machine.numero}</span>
            {/* Le numéro suffit pour se repérer ; le nom au survol ou à la sélection, le code d'alarme en panne. */}
            {horsLigne ? (
              <small>{LIBELLE_HORS_LIGNE}</small>
            ) : (
              (selected || hover || (etat === 'panne' && code)) && <small>{etat === 'panne' && code ? code : machine.nom}</small>
            )}
          </div>
        )}
      </Html>
    </group>
  );
}

export const Machine3D = memo(Machine3DImpl);

/** Silhouette de prévisualisation pendant le glisser-déposer depuis la bibliothèque. */
export function GhostMachine({ type, pos, valid, rotationDeg = 0 }: { type: string; pos: XY; valid: boolean; rotationDeg?: number }) {
  const fp = MODEL_FOOTPRINT[type] ?? MODEL_FOOTPRINT.custom;
  const w = fp.max[0] - fp.min[0];
  const d = fp.max[1] - fp.min[1];
  const color = valid ? '#ff7a3d' : '#ff3d6e';
  return (
    <group position={[pos[0], 0, pos[1]]} rotation={[0, (-rotationDeg * Math.PI) / 180, 0]}>
      <mesh position={[(fp.max[0] + fp.min[0]) / 2, fp.h / 2, (fp.max[1] + fp.min[1]) / 2]}>
        <boxGeometry args={[w, fp.h, d]} />
        <meshBasicMaterial color={color} transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <mesh position={[(fp.max[0] + fp.min[0]) / 2, fp.h / 2, (fp.max[1] + fp.min[1]) / 2]}>
        <boxGeometry args={[w, fp.h, d]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.7} />
      </mesh>
    </group>
  );
}
