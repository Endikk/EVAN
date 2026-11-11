/**
 * Modèle glTF d'une machine du kit, animé selon l'état : rouleaux et bande accélèrent puis ralentissent
 * avec la vitesse, voyants, organe ciblé mis en évidence (le reste de la machine s'estompe).
 * Utilisé par le plan de l'usine et par la page d'accueil.
 *
 * Sur le plan (`detail="auto"`), une machine petite à l'écran est dessinée en version fusionnée (mergedModel.ts) :
 * une trentaine d'appels de dessin au lieu de plusieurs centaines. La version détaillée et animée est créée à la
 * première approche, puis gardée.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { EtatMachine } from '@/domain/types';
import { disposeInstance, highlightNear, instantiate, resetHighlight, setVoyant, type CouleurVoyant, type Habillage, type VoyantRef } from './model';
import { instantiateFast } from './mergedModel';
import { useCouleurSelection } from './couleurs';

export interface OrganFocus {
  numero: number;
  kind: 'defaut' | 'selection';
}

const RED = new THREE.Color('#ff3d6e');

/** Rayon à l'écran (px CSS) au-delà duquel la version détaillée s'affiche, et en deçà duquel elle cède la place. */
const DETAIL_IN_PX = 150;
const DETAIL_OUT_PX = 110;
/** Durée du fondu quand un organe est ciblé ou quitté (s). */
const FONDU_S = 0.45;
/** Le niveau de détail est réévalué toutes les N images, pas à chaque image. */
const LOD_EVERY = 8;

interface Props {
  url: string;
  /** État affiché par les voyants ; une fonction est lue à chaque image, sans re-rendu React (comme `facteur`). */
  etat: EtatMachine | (() => EtatMachine);
  /** Vitesse rapportée à la nominale ; une fonction est lue à chaque image, sans re-rendu React. */
  facteur: number | (() => number);
  focus?: OrganFocus;
  reduced: boolean;
  /** Opacité du reste de la machine quand un organe est ciblé. */
  ghost?: number;
  /** Clignotement des voyants (0,1 à 1), lu à chaque image ; par défaut, l'horloge de la scène. */
  clignote?: () => number;
  /** `auto` : version fusionnée tant que la machine est petite à l'écran. Par défaut toujours détaillée (gros plans). */
  detail?: 'auto' | 'always';
  /** Matériaux et ombres de la version détaillée (page d'accueil). Doit garder la même identité d'un rendu à l'autre. */
  habillage?: Habillage;
}

const center = new THREE.Vector3();

/** Rayon apparent d'une sphère, en pixels CSS, pour une caméra perspective ou orthographique. */
function screenRadius(camera: THREE.Camera, viewportHeight: number, worldCenter: THREE.Vector3, radius: number): number {
  const ortho = camera as THREE.OrthographicCamera;
  if (ortho.isOrthographicCamera) return (radius * ortho.zoom * viewportHeight) / (ortho.top - ortho.bottom);
  const persp = camera as THREE.PerspectiveCamera;
  const dist = Math.max(0.01, camera.position.distanceTo(worldCenter));
  return (radius / (dist * Math.tan((persp.fov * Math.PI) / 360))) * (viewportHeight / 2);
}

function applyVoyants(voyants: Record<CouleurVoyant, VoyantRef>, etat: EtatMachine, blink: number) {
  setVoyant(voyants.vert, etat === 'marche' ? 1 : 0);
  setVoyant(voyants.orange, etat === 'attention' ? blink : etat === 'calage' ? 1 : 0);
  setVoyant(voyants.rouge, etat === 'panne' ? blink : 0);
}

export function MachineModel({ url, etat, facteur, focus, reduced, ghost, clignote, detail = 'always', habillage }: Props) {
  const { scene } = useGLTF(url);
  // L'organe choisi prend la couleur de sélection du thème, comme le contour et la balise ; la panne garde son rouge.
  const selection = useCouleurSelection();
  const fast = useMemo(() => (detail === 'auto' ? instantiateFast(scene) : null), [scene, detail]);
  const [near, setNear] = useState(false);
  const showDetail = !fast || !!focus || near;
  // Version détaillée créée à la première approche, puis gardée : pas de recréation à chaque zoom.
  const [detailWanted, setDetailWanted] = useState(showDetail);
  if (showDetail && !detailWanted) setDetailWanted(true);
  const inst = useMemo(() => (detailWanted ? instantiate(scene, habillage) : null), [scene, detailWanted, habillage]);
  const speed = useRef(0);
  const hits = useRef<THREE.Mesh[]>([]);
  // Estompage du reste de la machine, en fondu : niveau 0 (rien d'estompé) à 1 (estompé à `ghost`), vers `cible`.
  const fondu = useRef({ niveau: 0, cible: 0, mats: [] as THREE.Material[], ghost: 1 });
  const wrapper = useRef<THREE.Group>(null);
  const frame = useRef(0);

  useEffect(() => {
    if (fast) return () => disposeInstance(fast);
  }, [fast]);
  useEffect(() => {
    if (inst) return () => disposeInstance(inst);
  }, [inst]);

  useEffect(() => {
    if (!inst || !focus) return;
    const node = inst.diag.get(focus.numero);
    if (!node) return;
    wrapper.current?.updateMatrixWorld(true);
    const world = node.getWorldPosition(new THREE.Vector3());
    hits.current = highlightNear(inst, world, focus.kind === 'defaut' ? RED : new THREE.Color(selection), undefined, ghost);
    // highlightNear estompe le reste d'un coup : on repart de l'opacité pleine pour y aller en fondu.
    const touches = new Set(hits.current);
    const mats = inst.meshes.filter((m) => !touches.has(m)).flatMap((m) => (Array.isArray(m.material) ? m.material : [m.material]));
    for (const m of mats) m.opacity = inst.original.get(m)?.opacity ?? 1;
    fondu.current = { niveau: reduced ? 1 : 0, cible: 1, mats, ghost: ghost ?? 0.22 };
    // Organe quitté : le reste de la machine revient en fondu, la mise en évidence s'efface à la fin (useFrame).
    return () => {
      fondu.current.cible = 0;
    };
  }, [focus?.numero, focus?.kind, inst, ghost, reduced, selection]);

  useFrame((state, dt) => {
    if (fast && wrapper.current && ++frame.current % LOD_EVERY === 0) {
      center.copy(fast.sphere.center).applyMatrix4(wrapper.current.matrixWorld);
      const px = screenRadius(state.camera, state.size.height, center, fast.sphere.radius);
      const want = near ? px > DETAIL_OUT_PX : px > DETAIL_IN_PX;
      if (want !== near) setNear(want);
    }
    const f = typeof facteur === 'function' ? facteur() : facteur;
    const target = reduced ? 0 : Math.max(0, f);
    // Accélération et décélération progressives : on voit la presse ralentir puis s'arrêter.
    speed.current += (target - speed.current) * Math.min(1, dt * 1.8);
    const k = speed.current;
    const t = state.clock.elapsedTime;
    const blink = reduced ? 1 : clignote ? clignote() : Math.sin(t * 7) > -0.2 ? 1 : 0.1;
    const e = typeof etat === 'function' ? etat() : etat;
    if (!showDetail || !inst) {
      if (fast) applyVoyants(fast.voyants, e, blink);
      return;
    }
    if (k > 0.002) {
      for (const r of inst.rotatifs) r.o.rotateY(r.speed * k * dt);
      for (const b of inst.bandes) b.tex.offset.x -= b.rate * k * dt;
    }
    applyVoyants(inst.voyants, e, blink);
    const fd = fondu.current;
    if (fd.niveau !== fd.cible) {
      const pas = reduced ? 1 : dt / FONDU_S;
      fd.niveau = fd.cible > fd.niveau ? Math.min(fd.cible, fd.niveau + pas) : Math.max(fd.cible, fd.niveau - pas);
      for (const m of fd.mats) {
        const o = inst.original.get(m)?.opacity ?? 1;
        m.opacity = o + (fd.ghost - o) * fd.niveau;
      }
      if (fd.niveau === 0) {
        resetHighlight(inst);
        hits.current = [];
        fd.mats = [];
      }
    }
    if (hits.current.length) {
      const p = reduced ? 1 : 0.5 + 0.5 * Math.sin(t * 5.5);
      for (const m of hits.current) {
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          const s = mat as THREE.MeshStandardMaterial;
          if (s.emissive) s.emissiveIntensity = (0.35 + p * 1.5) * fd.niveau;
        }
      }
    }
  });

  const shown = showDetail && inst ? inst.root : fast?.root;
  return <group ref={wrapper}>{shown && <primitive object={shown} />}</group>;
}
