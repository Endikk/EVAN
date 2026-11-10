/**
 * Prise de vue de la presse de l'accueil, comme une photo de produit : une lumière principale qui porte des ombres
 * douces, des bandeaux lumineux qui dessinent des reflets longs sur les rouleaux chromés et le vernis des bâtis, un
 * contre-jour froid qui détache la silhouette du fond, et l'occultation ambiante (GTAO) qui assombrit ce qui se
 * touche : le pied des montants, l'intérieur des groupes, le dessous des rouleaux.
 *
 * Le rendu passe par une image intermédiaire en couleurs linéaires, puis une sortie maison : la toile est composée sur
 * la page en alpha prémultiplié (le film fond la presse dans le fond de la page), la sortie standard de three
 * appliquerait la courbe de tons sur des couleurs déjà multipliées par l'alpha.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/** Boîte des ombres (m) : la presse et son sol, pas plus, pour garder des ombres nettes. */
const OMBRE = { gauche: -5.4, droite: 5.4, haut: 3.6, bas: -3.6 };
/** Rayon de l'occultation (m) : les creux à l'échelle d'une main, pas la pièce entière. */
const AO_RAYON = 0.25;
/** Au-delà de cet écart de profondeur (m), une pièce n'en cache pas une autre. */
const AO_EPAISSEUR = 0.15;
/** Qualité adaptative : fenêtre d'observation (images), seuils et pas de la définition. */
const FENETRE = 60;
/** Images ignorées au démarrage : chargement et compilation font sauter des images sans rien dire du rendu. */
const DEMARRAGE = 120;
const IMAGE_SAUTEE = 0.022;
const SAUTS_TOLERES = 3;
const FENETRES_CALMES = 10;
const PAS_QUALITE = 0.2;
const QUALITE_MIN = 0.6;
const QUALITE_FILM = 0.8;

const SORTIE_VERTEX = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Couleur rendue à elle-même (divisée par l'alpha), courbe de tons et passage en sRGB, puis de nouveau prémultipliée.
const SORTIE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float a = clamp(c.a, 0.0, 1.0);
  vec3 rgb = a > 0.0001 ? c.rgb / a : vec3(0.0);
  rgb = ACESFilmicToneMapping(rgb);
  vec4 s = sRGBTransferOETF(vec4(rgb, 1.0));
  gl_FragColor = vec4(s.rgb * a, a);
}`;

/** Accès aux deux méthodes internes de GTAOPass qui cachent ce qui ne doit pas compter dans l'occultation. */
interface GtaoInterne {
  _overrideVisibility(): void;
  _visibilityCache: THREE.Object3D[];
}

function creerRendu(gl: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  // Lire le journal de chaque shader attend la fin de sa compilation, et annule la compilation en parallèle de
  // compileAsync : en production, on ne le lit plus.
  gl.debug.checkShaderErrors = import.meta.env.DEV;
  const cible = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const composer = new EffectComposer(gl, cible);
  // La scène est toujours dessinée dans ce tampon-ci (deux échanges par image) : lui seul a besoin de l'anticrénelage.
  composer.renderTarget2.samples = Math.min(4, gl.capabilities.maxSamples);
  composer.addPass(new RenderPass(scene, camera));

  const ao = new GTAOPass(scene, camera, 1, 1);
  ao.output = GTAOPass.OUTPUT.Default;
  ao.blendIntensity = 1;
  // Épaisseur courte : un montant à 70 cm devant une tôle ne l'assombrit pas (sinon, un halo bruité l'entoure).
  ao.updateGtaoMaterial({ radius: AO_RAYON, distanceExponent: 1.6, thickness: AO_EPAISSEUR, scale: 1.15, distanceFallOff: 1, samples: 16, screenSpaceRadius: false });
  // Seize échantillons, débruités sur un disque large : au double, les gros plans du film sautaient des images.
  ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 8, radiusExponent: 1, rings: 3, samples: 16 });
  // Pleine définition : à mi-définition, le bruit de l'occultation remonte en neige sur les tôles claires.
  // Les surfaces transparentes (carters, ombre peinte au sol, presse estompée) ne cachent rien : sans ça, les
  // rouleaux derrière un carter perdraient leur occultation.
  const interne = ao as unknown as GtaoInterne;
  const cacherBase = interne._overrideVisibility.bind(ao);
  interne._overrideVisibility = () => {
    cacherBase();
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !o.visible) return;
      const m = mesh.material;
      if (Array.isArray(m) ? m.every((x) => x.transparent) : m.transparent) {
        o.visible = false;
        interne._visibilityCache.push(o);
      }
    });
  };
  composer.addPass(ao);

  const sortie = new ShaderPass(
    new THREE.RawShaderMaterial({
      name: 'SortiePremultipliee',
      uniforms: { tDiffuse: { value: null }, toneMappingExposure: { value: gl.toneMappingExposure } },
      vertexShader: SORTIE_VERTEX,
      fragmentShader: SORTIE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    }),
  );
  composer.addPass(sortie);
  return { composer, ao, sortie, cible };
}

/**
 * Compile d'avance les shaders de toute la scène, pour l'image intermédiaire où ils servent : sinon chaque pièce
 * compile le sien la première fois qu'elle entre dans le champ, et le film d'ouverture, qui longe la presse de près,
 * se figerait à chaque nouveau groupe.
 */
const Precompiler = createContext<() => Promise<void>>(() => Promise.resolve());
export const usePrecompiler = () => useContext(Precompiler);

/** Rendu de la scène : prend la main sur le rendu de R3F (priorité 1). */
function Rendu({ children, reduit }: { children: ReactNode; reduit: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const r = useMemo(() => creerRendu(gl, scene, camera), [gl, scene, camera]);
  const precompiler = useCallback(async () => {
    const avant = gl.getRenderTarget();
    // Les paramètres des programmes (courbe de tons, espace de couleur) dépendent de la cible : celle du rendu.
    gl.setRenderTarget(r.composer.renderTarget2);
    const fini = gl.compileAsync(scene, camera);
    gl.setRenderTarget(avant);
    await fini;
    // Une image d'essai, presse entière dans le champ : le pilote graphique prépare ses états de dessin à la première
    // utilisation de chaque programme, ce qui figerait encore le film à l'entrée de chaque pièce dans le cadre. La
    // caméra est replacée par le cadrage à l'image suivante.
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, 5, 24);
    cam.lookAt(0, 0.8, 0);
    cam.clearViewOffset();
    cam.updateMatrixWorld();
    r.composer.render(0);
  }, [gl, scene, camera, r]);
  // Définition du rendu, rapportée à celle de la toile : elle baisse d'un cran quand des images sautent (gros plans du
  // film sur une carte graphique modeste), et remonte après un long moment sans à-coup.
  const qualite = useRef({ k: 1, images: -DEMARRAGE, sautees: 0, calme: 0 });
  const appliquer = useCallback(() => {
    const k = reduit ? Math.min(QUALITE_FILM, qualite.current.k) : qualite.current.k;
    r.composer.setPixelRatio(dpr * k);
    r.composer.setSize(size.width, size.height);
  }, [r, size.width, size.height, dpr, reduit]);
  useEffect(appliquer, [appliquer]);
  useEffect(
    () => () => {
      r.ao.dispose();
      r.sortie.dispose();
      r.composer.dispose();
      r.cible.dispose();
    },
    [r],
  );
  useFrame((_, dt) => {
    r.composer.render(dt);
    const q = qualite.current;
    // Une image au-delà de 22 ms a manqué le rafraîchissement ; au-delà de 250 ms, c'est un chargement, pas le rendu.
    if (++q.images <= 0) return;
    if (dt > IMAGE_SAUTEE && dt < 0.25) q.sautees++;
    if (q.images < FENETRE) return;
    if (q.sautees >= SAUTS_TOLERES && q.k > QUALITE_MIN) {
      q.k = Math.max(QUALITE_MIN, q.k - PAS_QUALITE);
      q.calme = 0;
      appliquer();
    } else if (q.sautees === 0 && q.k < 1 && ++q.calme >= FENETRES_CALMES) {
      q.k = Math.min(1, q.k + PAS_QUALITE);
      q.calme = 0;
      appliquer();
    } else if (q.sautees > 0) q.calme = 0;
    q.images = 0;
    q.sautees = 0;
  }, 1);
  return <Precompiler.Provider value={precompiler}>{children}</Precompiler.Provider>;
}

interface StudioProps {
  dark: boolean;
  /** Film d'ouverture en cours : la caméra court au ras des pièces, la définition baisse d'un cran, sans que ça se voie. */
  film: boolean;
  children: ReactNode;
}

export function Studio({ dark, film, children }: StudioProps) {
  const cle = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const l = cle.current;
    if (!l) return;
    const c = l.shadow.camera;
    c.left = OMBRE.gauche;
    c.right = OMBRE.droite;
    c.top = OMBRE.haut;
    c.bottom = OMBRE.bas;
    c.near = 1;
    c.far = 32;
    c.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, []);
  return (
    <Rendu reduit={film}>
      {children}
      {/* Lumière principale venue de la gauche, côté dérouleur : les ombres tombent vers la sortie de la presse. */}
      <directionalLight
        ref={cle}
        position={[-5.5, 9, 6.5]}
        intensity={dark ? 2.3 : 2.6}
        color="#fff3e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.018}
        shadow-radius={4}
      />
      {/* Débouchage doux face caméra, sans ombre. */}
      <directionalLight position={[7, 5, 9]} intensity={dark ? 0.55 : 0.75} color="#f4f7ff" />
      {/* Contre-jour froid : il découpe la silhouette sur le fond de nuit. */}
      <directionalLight position={[4, 6, -9]} intensity={dark ? 1.5 : 0.9} color="#cfe0ff" />
      <hemisphereLight args={[dark ? '#bcc7dc' : '#ffffff', dark ? '#16161a' : '#a9a8a2', dark ? 0.35 : 0.6]} />
      <Environment resolution={512} frames={1} environmentIntensity={dark ? 0.9 : 1}>
        {/* Grand diffuseur au plafond. */}
        <Lightformer form="rect" intensity={2.6} position={[0, 9, 1]} rotation-x={Math.PI / 2} scale={[11, 3, 1]} />
        {/* Deux bandeaux longs : les reflets en ligne sur les rouleaux et les arêtes vernies. */}
        <Lightformer form="rect" intensity={5} position={[-2, 4.5, 7]} rotation-y={Math.PI} scale={[16, 0.5, 1]} color="#fff6ea" />
        <Lightformer form="rect" intensity={3} position={[2, 2.2, 8]} rotation-y={Math.PI} scale={[16, 0.3, 1]} color="#ffffff" />
        {/* Panneaux latéraux, chaud à gauche, froid à droite. */}
        <Lightformer form="rect" intensity={1.6} position={[-11, 3, 3]} rotation-y={Math.PI / 2} scale={[8, 5, 1]} color="#ffe9cc" />
        <Lightformer form="rect" intensity={1.3} position={[11, 3, -2]} rotation-y={-Math.PI / 2} scale={[8, 5, 1]} color="#dce8ff" />
        {/* Contre-jour : une ligne fine derrière la presse. */}
        <Lightformer form="rect" intensity={4} position={[0, 3, -9]} scale={[20, 0.6, 1]} color="#d6e4ff" />
        {/* Sol d'atelier clair, qui renvoie un peu de lumière sous les rouleaux. */}
        <Lightformer form="rect" intensity={0.35} position={[0, -3, 0]} rotation-x={-Math.PI / 2} scale={[20, 10, 1]} color="#c9c4bb" />
      </Environment>
    </Rendu>
  );
}
