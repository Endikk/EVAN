/**
 * Scène unique pour les étapes 2 à 6 : sol satellite, bâtiments extrudés, zones, machines.
 * Le comportement change avec l'étape (édition, sélection d'organe, supervision).
 * Le plan 2D est cette même scène vue de dessus par une caméra orthographique : mêmes modèles 3D des machines,
 * mêmes états animés, à l'échelle.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Grid, Lightformer, OrthographicCamera, useGLTF } from '@react-three/drei';
import { useProject, siteBounds } from '@/store/project';
import { useUi, useIsDark, useReducedMotion } from '@/store/ui';
import { useLive } from '@/store/live';
import { machineModel, MODEL_FOOTPRINT } from '@/domain/catalog';
import { ETAT_COULEUR, etatAffiche } from '@/ui/status';
import { pointInPolygon, toLocal, type XY } from '@/geo/geodesy';
import { Building3D } from './Building3D';
import { SatelliteGround } from './SatelliteGround';
import { Zones3D } from './Zones3D';
import { GhostMachine, Machine3D, type OrganFocus } from './Machine3D';
import { CameraRig } from './CameraRig';
import { sceneHandle, snap, useSceneUi } from './sceneState';
import { OrganBeacon } from './OrganBeacon';
import { ZoneDrawer, ZoneHandles } from './ZoneEditor';

/** Vitesse d'une machine lue à chaque image dans le store, sans abonnement React (un getter stable par machine). */
const facteurGetters = new Map<string, () => number>();
function liveFacteur(id: string) {
  let g = facteurGetters.get(id);
  if (!g) facteurGetters.set(id, (g = () => useLive.getState().machines[id]?.facteur ?? 0));
  return g;
}
const moveMachine = (id: string, pos: XY) => useProject.getState().updateMachine(id, { position: pos });
const rotateMachine = (id: string, deg: number) => useProject.getState().updateMachine(id, { rotationDeg: deg });

/**
 * Lumières de panne en nombre fixe, toujours présentes, éteintes quand rien n'est en panne. Ajouter ou retirer une
 * lumière change le nombre de lumières de la scène, et three.js recompile alors les shaders de tous les matériaux :
 * une vingtaine de programmes, plus d'une seconde de gel au moment même où la panne s'affiche.
 */
// Au-delà de deux pannes simultanées, les suivantes gardent leur cône et leur anneau, sans halo.
const FAULT_LIGHTS = 2;
function FaultLights({ spots, reduced }: { spots: [number, number][]; reduced: boolean }) {
  return (
    <>
      {Array.from({ length: FAULT_LIGHTS }, (_, i) => {
        const s = spots[i];
        return (
          <pointLight
            key={i}
            position={s ? [s[0], 3.2, s[1]] : [0, -100, 0]}
            color={ETAT_COULEUR.panne}
            intensity={s ? (reduced ? 6 : 10) : 0}
            distance={10}
            decay={1.6}
          />
        );
      })}
    </>
  );
}

/** Centre de l'emprise d'une machine, dans le repère de l'usine. */
function footprintCenter(m: { type: string; position: XY; rotationDeg: number }): XY {
  const fp = MODEL_FOOTPRINT[m.type] ?? MODEL_FOOTPRINT.custom;
  const x = (fp.max[0] + fp.min[0]) / 2;
  const z = (fp.max[1] + fp.min[1]) / 2;
  const a = (-m.rotationDeg * Math.PI) / 180;
  return [m.position[0] + x * Math.cos(a) + z * Math.sin(a), m.position[1] - x * Math.sin(a) + z * Math.cos(a)];
}

/** Fond du plan 2D (hors bâtiment). */
const PLAN_BG = { light: '#ece9e4', dark: '#070b15' };
/**
 * Brouillard de la vue 3D (couleur, début, fin). Le jour, il commence plus loin : un voile clair sur l'orthophoto
 * la délave, là où le voile sombre de la nuit se lit comme de la distance.
 */
const FOG = { light: ['#e3e0db', 380, 1300], dark: ['#060a14', 260, 900] } as const;

function CanvasHandle() {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    sceneHandle.canvas = gl.domElement;
    sceneHandle.camera = camera;
    // Inspection en développement (outils navigateur, tests de bout en bout).
    if (import.meta.env.DEV) Object.assign(window, { __evanScene: scene, __evanHandle: sceneHandle });
  }, [gl, camera, scene]);
  return null;
}

// Branche le calcul du point au sol sur sceneHandle (glisser-déposer de la bibliothèque) dès que la scène est là.
export { groundPointFromClient } from './sol';

/** Une position est valide si la machine est dans un bâtiment. */
export function useInsideBuilding() {
  const site = useProject((s) => s.site);
  const batiments = useProject((s) => s.batiments);
  const rings = useMemo(() => (site ? batiments.map((b) => b.contour.map((p) => toLocal(site.repere, p))) : []), [site, batiments]);
  return useCallback((pos: XY) => rings.some((r) => pointInPolygon(pos, r)), [rings]);
}

export interface SceneProps {
  /** Étape courante : pilote l'interactivité. */
  step: number;
  /** Scène cachée (historique) : plus aucun rendu, état conservé. */
  paused?: boolean;
  organFocus?: { machineId: string; organeId: string; kind: OrganFocus['kind'] };
  organCard?: ReactNode;
  onMachineSelect(id: string): void;
  onFloorClick?(pos: XY): void;
}

/** Précharge les modèles des machines de l'usine (et seulement eux) pendant que la carte est encore affichée. */
function usePreloadModels() {
  const urls = useProject(useShallow((s) => [...new Set(s.machines.map((m) => m.modele.url))]));
  useEffect(() => urls.forEach((u) => useGLTF.preload(u)), [urls]);
}

export function SceneCanvas(props: SceneProps) {
  usePreloadModels();
  const dark = useIsDark();
  const view = useUi((s) => s.view);
  const plan = view === '2d' && props.step >= 2 && props.step <= 6;
  const planFond = useSceneUi((s) => s.planFond);
  const fog = FOG[dark ? 'dark' : 'light'];
  const bg = plan && planFond === 'plan' ? PLAN_BG[dark ? 'dark' : 'light'] : fog[0];
  return (
    <Canvas
      frameloop={props.paused ? 'never' : 'always'}
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 36.87, near: 0.1, far: 4000, position: [60, 80, 120] }}
      onPointerMissed={() => {
        const ui = useUi.getState();
        if (props.step === 3 || props.step === 4 || props.step === 5) ui.selectMachine(undefined);
        if (props.step === 2) ui.selectZone(undefined);
      }}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={[bg]} />
      {/* Pas de brouillard sur le plan : la caméra orthographique est haute, tout doit rester net. */}
      {!plan && <fog attach="fog" args={fog} />}
      <CanvasHandle />
      <SceneContent {...props} dark={dark} plan={plan} planFond={planFond} />
    </Canvas>
  );
}

function SceneContent({ step, organFocus, organCard, onMachineSelect, onFloorClick, dark, plan, planFond }: SceneProps & { dark: boolean; plan: boolean; planFond: 'plan' | 'satellite' }) {
  const site = useProject((s) => s.site);
  const batiments = useProject((s) => s.batiments);
  const zones = useProject((s) => s.zones);
  const machines = useProject((s) => s.machines);
  const perso = useProject((s) => s.perso);
  const selectedMachineId = useUi((s) => s.selectedMachineId);
  const selectedZoneId = useUi((s) => s.selectedZoneId);
  const showLabels = useUi((s) => s.showLabels);
  const reduced = useReducedMotion();
  // États seuls : la télémétrie (vitesse, compteurs) arrive chaque seconde sans re-rendre la scène.
  const etats = useLive(useShallow((s) => Object.fromEntries(Object.entries(s.machines).map(([id, m]) => [id, etatAffiche(m)]))));
  const horsLigne = useLive(useShallow((s) => Object.keys(s.machines).filter((id) => s.machines[id].horsLigne)));
  const alarms = useLive((s) => s.alarms);
  // Rappel stable : Machine3D est mémoïsé, une fonction recréée à chaque rendu le ferait re-rendre.
  const selectRef = useRef(onMachineSelect);
  selectRef.current = onMachineSelect;
  const onSelect = useCallback((id: string) => selectRef.current(id), []);
  const ghost = useSceneUi((s) => s.ghost);
  const placingType = useUi((s) => s.placingType);
  const zoneTool = useUi((s) => s.zoneTool);
  // Niveau de détail du plan : noms des machines à partir de 14 px par mètre.
  const detail = useSceneUi((s) => s.planZoom >= 14);
  const inside = useInsideBuilding();
  // Changement d'usine : la scène se vide d'elle-même (mise à jour propre à la racine 3D), puis se remplit avec la
  // nouvelle usine. Ses étiquettes HTML ne doivent pas être démontées depuis un rendu du DOM (portails cassés).
  const switching = useSceneUi((s) => s.switching);
  // Les étiquettes HTML (drei) s'attachent à l'élément des événements une fois celui-ci connecté ; montées avant,
  // elles se remonteraient toutes à la connexion (deux racines React sur le même conteneur, erreurs au démontage).
  const connected = useThree((s) => !!s.events.connected);

  const rings = useMemo(() => (site ? batiments.map((b) => b.contour.map((p) => toLocal(site.repere, p))) : []), [site, batiments]);
  const bounds = useMemo(() => siteBounds(rings.flat()), [rings]);

  if (!site || switching || !connected) return null;
  const half: XY = [bounds.size[0] / 2, bounds.size[1] / 2];
  const editable = step === 3;
  const rotatable = step >= 3 && step <= 5;
  const satellite = !plan || planFond === 'satellite';

  const focusOf = (id: string): OrganFocus | undefined => {
    if (!organFocus || organFocus.machineId !== id) return undefined;
    const m = machines.find((x) => x.id === id);
    const o = m ? machineModel(m, perso[m.id]).organes.find((x) => x.id === organFocus.organeId) : undefined;
    return o ? { numero: o.numero, kind: organFocus.kind } : undefined;
  };

  const faultSpots = step >= 4 ? machines.filter((m) => etats[m.id] === 'panne').map(footprintCenter) : [];
  const focusMachine = organFocus ? machines.find((m) => m.id === organFocus.machineId) : undefined;
  const focusOrgan = focusMachine ? machineModel(focusMachine, perso[focusMachine.id]).organes.find((o) => o.id === organFocus!.organeId) : undefined;
  let beaconPos: [number, number, number] | undefined;
  if (focusMachine && focusOrgan?.position) {
    const a = (-focusMachine.rotationDeg * Math.PI) / 180;
    const [x, y, z] = focusOrgan.position;
    beaconPos = [focusMachine.position[0] + x * Math.cos(a) + z * Math.sin(a), y + 0.05, focusMachine.position[1] - x * Math.sin(a) + z * Math.cos(a)];
  }

  return (
    <>
      <hemisphereLight args={[dark ? '#9fb3d9' : '#ffffff', dark ? '#1b1f27' : '#8a8f99', dark ? 0.75 : 1.0]} />
      <directionalLight position={[60, 120, 40]} intensity={dark ? 1.4 : 2.0} />
      <directionalLight position={[-80, 60, -50]} intensity={0.35} />
      <FaultLights spots={faultSpots} reduced={reduced} />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={2.2} position={[0, 12, 0]} rotation-x={Math.PI / 2} scale={[40, 40, 1]} />
        <Lightformer intensity={1.2} position={[-30, 6, 10]} rotation-y={Math.PI / 2} scale={[30, 8, 1]} color="#cfe3ff" />
        <Lightformer intensity={1} position={[30, 6, -10]} rotation-y={-Math.PI / 2} scale={[30, 8, 1]} color="#ffe9d1" />
      </Environment>

      {plan && (
        <OrthographicCamera makeDefault position={[bounds.center[0], 150, bounds.center[1] + 0.001]} near={1} far={600} zoom={useSceneUi.getState().planZoom} />
      )}
      <SatelliteGround frame={site.repere} center={bounds.center} half={half} dark={dark} visible={satellite} />
      {batiments.map((b, i) => (
        <Building3D
          key={b.id}
          b={b}
          frame={site.repere}
          dark={dark}
          plan={plan}
          satellite={planFond === 'satellite'}
          cotes={showLabels && step <= 3}
          detail={detail}
          others={rings.filter((_, j) => j !== i)}
        />
      ))}
      {plan && planFond === 'plan' && (step === 2 || step === 3) && (
        <Grid
          position={[bounds.center[0], 0.02, bounds.center[1]]}
          args={[bounds.size[0] + 40, bounds.size[1] + 40]}
          cellSize={1}
          sectionSize={5}
          cellThickness={0.6}
          sectionThickness={1}
          cellColor={dark ? '#1c2533' : '#dde3eb'}
          sectionColor={dark ? '#2a3546' : '#c6cfdb'}
          fadeDistance={1000}
          fadeStrength={0}
          infiniteGrid={false}
        />
      )}
      {!plan && (step === 3 || step === 2) && (
        // Dessinée après la dalle du bâtiment (renderOrder) : sinon la grille écrit sa profondeur la première, la dalle
        // ne passe plus sous ses traits, et ceux-ci se fondent dans la photo du toit (traits noirs sur dalle claire).
        <Grid
          renderOrder={1}
          position={[bounds.center[0], 0.03, bounds.center[1]]}
          args={[bounds.size[0] + 20, bounds.size[1] + 20]}
          cellSize={1}
          sectionSize={5}
          cellThickness={0.5}
          sectionThickness={1}
          cellColor={dark ? '#3a465a' : '#b9c1cc'}
          sectionColor={dark ? '#5b6a84' : '#98a3b2'}
          fadeDistance={260}
          fadeStrength={1.5}
          infiniteGrid={false}
        />
      )}
      <Zones3D
        zones={zones}
        selectedId={selectedZoneId}
        onSelect={step === 2 ? (id) => useUi.getState().selectZone(id) : undefined}
        showLabels={showLabels && step <= 3}
        plan={plan}
      />
      {/* Outils de zone toujours montés (inertes hors étape 2) : leurs cotes HTML ne sont jamais démontées. */}
      <ZoneDrawer type={plan && step === 2 ? zoneTool : null} center={bounds.center} size={bounds.size} />
      <ZoneHandles zone={step === 2 && !zoneTool ? zones.find((z) => z.id === selectedZoneId) : undefined} />

      {/* Sol cliquable : pose au toucher depuis la bibliothèque, désélection. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[bounds.center[0], 0.01, bounds.center[1]]}
        visible={false}
        onClick={(e) => {
          if (!onFloorClick || !placingType) return;
          e.stopPropagation();
          onFloorClick([snap(e.point.x), snap(e.point.z)]);
        }}
      >
        <planeGeometry args={[bounds.size[0] + 200, bounds.size[1] + 200]} />
        <meshBasicMaterial />
      </mesh>

      <Suspense fallback={null}>
        {machines.map((m) => {
          const code = alarms.find((x) => x.machineId === m.id && x.gravite === 'critique' && x.statut !== 'resolue')?.code;
          return (
            <Machine3D
              key={m.id}
              machine={m}
              etat={step >= 4 ? (etats[m.id] ?? 'marche') : 'arret'}
              horsLigne={step >= 4 && horsLigne.includes(m.id)}
              facteur={step >= 4 ? liveFacteur(m.id) : 0}
              selected={m.id === selectedMachineId}
              focus={focusOf(m.id)}
              editable={editable}
              rotatable={rotatable}
              plan={plan}
              detail={detail}
              showTag={showLabels}
              reduced={reduced}
              code={code}
              onSelect={onSelect}
              onMove={moveMachine}
              onRotate={rotateMachine}
              isValid={inside}
            />
          );
        })}
      </Suspense>
      {ghost && <GhostMachine type={ghost.type} pos={ghost.pos} valid={ghost.valid} />}
      {beaconPos && (
        <OrganBeacon position={beaconPos} color={organFocus?.kind === 'defaut' ? '#ff3d6e' : '#ff7a3d'}>
          {organCard}
        </OrganBeacon>
      )}
      <CameraRig key={plan ? '2d' : '3d'} frame={site.repere} center={bounds.center} size={bounds.size} view={plan ? '2d' : '3d'} />
    </>
  );
}

/** Dimensions utiles pour cadrer une machine (bibliothèque, aperçus). */
export function footprintSize(type: string) {
  const fp = MODEL_FOOTPRINT[type] ?? MODEL_FOOTPRINT.custom;
  return { w: fp.max[0] - fp.min[0], d: fp.max[1] - fp.min[1], h: fp.h };
}
