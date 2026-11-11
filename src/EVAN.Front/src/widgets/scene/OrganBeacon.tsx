/**
 * Balise d'un organe ciblé (panne ou sélection) : point et anneau face à la caméra, carte HTML facultative.
 * Partagée par le plan de l'usine et la scène du rejeu, dans son propre fichier pour que le rejeu ne tire pas tout le
 * plan avec lui.
 * Seul un organe en défaut bat (`bat`), et en opacité seulement : l'anneau garde sa taille. Un organe simplement choisi
 * garde un anneau fixe.
 *
 * La carte reste dans la scène : à droite de l'organe quand elle y tient, sinon à sa gauche, et toujours bornée aux
 * bords de la vue (sous les commandes du haut, au-dessus de la légende du bas). Elle ne passe plus sous le panneau
 * de droite ni hors de l'écran sur une tablette.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useReducedMotion } from '@/store/ui';
import { placerCarte, type Cadre } from './placementCarte';

/** Échelle fixe de l'anneau : celle qu'il avait au milieu de l'ancienne onde, assez large pour entourer l'organe. */
const ECHELLE_ANNEAU = 1.3;

/** Bords réservés de la scène : commandes flottantes en haut (3D/2D, étiquettes), légende des états en bas. */
const CADRE: Omit<Cadre, 'largeur' | 'hauteur'> = { marge: 12, haut: 64, bas: 60, ecart: 28 };

const v = new THREE.Vector3();

/** Position à l'écran (px, depuis le coin haut gauche du canevas) d'un objet de la scène. */
function aLEcran(o: THREE.Object3D, camera: THREE.Camera, size: { width: number; height: number }): [number, number] {
  v.setFromMatrixPosition(o.matrixWorld).project(camera);
  return [(v.x * size.width) / 2 + size.width / 2, (-v.y * size.height) / 2 + size.height / 2];
}

export function OrganBeacon({ position, color, bat = false, children }: { position: [number, number, number]; color: string; bat?: boolean; children?: ReactNode }) {
  const reduced = useReducedMotion();
  const ring = useRef<THREE.Mesh>(null);
  // Taille de la carte, suivie sans relire la mise en page à chaque image. La carte est rendue par Html dans sa propre
  // racine, après coup : on l'observe dès qu'elle est montée (référence fonction), pas au montage de la balise.
  const taille = useRef<[number, number]>([0, 0]);
  const carte = useRef<HTMLDivElement | null>(null);
  const observateur = useRef<ResizeObserver | null>(null);
  const suivreCarte = useCallback((el: HTMLDivElement | null) => {
    observateur.current?.disconnect();
    observateur.current = null;
    carte.current = el;
    if (!el) return;
    const mesurer = () => {
      taille.current = [el.offsetWidth, el.offsetHeight];
    };
    observateur.current = new ResizeObserver(mesurer);
    observateur.current.observe(el);
    mesurer();
  }, []);
  useEffect(() => () => observateur.current?.disconnect(), []);
  // Hauteur disponible dans la scène, donnée à la fiche : plus haute, elle défile à l'intérieur au lieu de déborder.
  const hauteurDispo = useRef(0);

  useFrame((state) => {
    if (!ring.current) return;
    ring.current.scale.setScalar(ECHELLE_ANNEAU);
    const pouls = 0.5 + 0.5 * Math.cos((state.clock.elapsedTime * Math.PI * 2) / 1.1);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = bat && !reduced ? 0.2 + 0.7 * pouls : 0.85;
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
        <Html
          position={[0.25, 0.35, 0]}
          zIndexRange={[40, 30]}
          style={{ pointerEvents: 'auto' }}
          calculatePosition={(el, camera, size) => {
            const ancre = aLEcran(el, camera, size);
            const organe = el.parent ? aLEcran(el.parent, camera, size) : ancre;
            const dispo = Math.max(160, size.height - CADRE.haut - CADRE.bas);
            if (dispo !== hauteurDispo.current && carte.current) {
              hauteurDispo.current = dispo;
              carte.current.style.setProperty('--fiche-hauteur-max', `${dispo}px`);
            }
            return placerCarte(ancre, organe, taille.current, { ...CADRE, largeur: size.width, hauteur: size.height });
          }}
        >
          <div ref={suivreCarte}>{children}</div>
        </Html>
      )}
    </group>
  );
}
