/**
 * Matières de la presse de l'accueil. Le modèle du kit ne donne qu'une couleur, un métal et une rugosité par pièce :
 * à l'écran, tout ressemble à du plastique. Chaque matériau est reconnu à ces trois valeurs (tôle peinte, acier
 * usiné, chrome, caoutchouc, papier, verre…) et refait en matériau physique, avec ce qui manque à l'œil : le vernis
 * des tôles, le grain de la peinture poudre, les stries de tournage des rouleaux, l'usure des teintes, la crasse au
 * pied de la machine.
 *
 * Ce grain est calculé dans le shader, dans le repère de chaque pièce (il tourne avec les rouleaux) : aucune texture
 * à charger. Il s'efface quand il devient plus fin qu'un pixel, sans scintiller au loin. Le plan de l'usine garde
 * les matériaux du kit : seul l'accueil passe par ici.
 */
import * as THREE from 'three';
import type { Habillage } from '@/widgets/scene/model';
import { affinerTexture } from './textures';

export type Classe =
  | 'tole'
  | 'sombre'
  | 'caoutchouc'
  | 'chrome'
  | 'acier'
  | 'papier'
  | 'carton'
  | 'sol'
  | 'marquage'
  | 'verre'
  | 'plastique'
  | 'imprime';

/** Ce qui suffit à reconnaître une matière : les valeurs du kit, et le nom de la pièce. */
export interface Signature {
  couleur: [number, number, number];
  metal: number;
  rugosite: number;
  opacite: number;
  texture: boolean;
  emissif: boolean;
  eclaire: boolean;
  nom: string;
}

const luminance = ([r, g, b]: [number, number, number]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const saturation = ([r, g, b]: [number, number, number]) => {
  const max = Math.max(r, g, b);
  return max > 0 ? (max - Math.min(r, g, b)) / max : 0;
};

/** Classe d'une matière du kit, ou nulle : écrans, voyants et ombre peinte au sol restent tels quels. */
export function classer(s: Signature): Classe | null {
  if (!s.eclaire || s.emissif) return null;
  if (s.opacite < 0.5) return 'verre';
  if (s.nom.startsWith('socle')) return luminance(s.couleur) > 0.25 && saturation(s.couleur) > 0.5 ? 'marquage' : 'sol';
  // Une texture porte déjà l'aspect de la pièce (flanc de bobine, film de dorure, cadran) : elle passe avant le métal.
  if (s.texture) return 'imprime';
  if (s.metal >= 0.85 && s.rugosite <= 0.12) return 'chrome';
  if (s.metal >= 0.6) return 'acier';
  const l = luminance(s.couleur);
  if (l < 0.05) return s.rugosite >= 0.55 ? 'caoutchouc' : 'sombre';
  if (s.rugosite >= 0.8) return saturation(s.couleur) > 0.5 ? 'carton' : 'papier';
  if (saturation(s.couleur) > 0.45) return 'plastique';
  return 'tole';
}

/**
 * Réglages du grain d'une classe. `relief` : fréquence (par mètre) et hauteur (m) du relief ; `rugosite` : écart de
 * rugosité et fréquence ; `etire` : relief et rugosité varient `etire` fois plus vite selon l'axe long de la pièce
 * (stries de tournage) ; `teinte` : écart de couleur et fréquence ; `crasse` : assombrissement au ras du sol.
 */
interface Grain {
  relief: [number, number];
  etire: number;
  rugosite: [number, number];
  teinte: [number, number];
  crasse: number;
}

/** Ce que devient chaque classe en matériau physique. */
interface Recette {
  grain: Grain;
  physique: Partial<Pick<THREE.MeshPhysicalMaterial, 'roughness' | 'metalness' | 'clearcoat' | 'clearcoatRoughness' | 'sheen' | 'sheenRoughness' | 'ior' | 'specularIntensity' | 'envMapIntensity'>>;
  /** Couleur minimale (linéaire) : un noir pur ne montre plus rien de sa matière. */
  plancher?: number;
  /** Teinte du lustre du caoutchouc. */
  lustre?: string;
  ombre: boolean;
}

const RECETTES: Record<Classe, Recette> = {
  // Tôle peinte et vernie des bâtis : peau d'orange fine, vernis qui accroche les lumières.
  tole: {
    grain: { relief: [260, 0.000045], etire: 1, rugosite: [0.1, 9], teinte: [0.05, 1.6], crasse: 0.18 },
    physique: { roughness: 0.36, metalness: 0, clearcoat: 0.55, clearcoatRoughness: 0.16 },
    ombre: true,
  },
  // Tôle sombre en peinture poudre (socle, carters) : grain marqué, satiné.
  sombre: {
    grain: { relief: [700, 0.00002], etire: 1, rugosite: [0.12, 14], teinte: [0.06, 2.2], crasse: 0.3 },
    physique: { roughness: 0.52, metalness: 0.05, clearcoat: 0.12, clearcoatRoughness: 0.5 },
    plancher: 0.032,
    ombre: true,
  },
  // Rouleaux en caoutchouc, flexibles, poignées : mat, avec un lustre rasant.
  caoutchouc: {
    grain: { relief: [1100, 0.00001], etire: 1, rugosite: [0.07, 40], teinte: [0.05, 5], crasse: 0.1 },
    physique: { roughness: 0.6, metalness: 0, sheen: 0.6, sheenRoughness: 0.55 },
    plancher: 0.02,
    lustre: '#3a3f46',
    ombre: true,
  },
  // Rouleaux chromés : poli miroir, stries de tournage à peine visibles.
  chrome: {
    grain: { relief: [6, 0.000004], etire: 90, rugosite: [0.04, 2], teinte: [0.02, 3], crasse: 0 },
    physique: { roughness: 0.07, metalness: 1, envMapIntensity: 1.25 },
    ombre: true,
  },
  // Acier usiné (axes, paliers) : stries de tournage nettes.
  acier: {
    grain: { relief: [8, 0.000008], etire: 60, rugosite: [0.1, 1.5], teinte: [0.04, 4], crasse: 0.08 },
    physique: { roughness: 0.3, metalness: 1 },
    ombre: true,
  },
  papier: {
    grain: { relief: [500, 0.000012], etire: 1, rugosite: [0.06, 30], teinte: [0.035, 7], crasse: 0 },
    physique: { roughness: 0.88, metalness: 0, sheen: 0.25, sheenRoughness: 0.8 },
    lustre: '#ffffff',
    ombre: true,
  },
  carton: {
    grain: { relief: [380, 0.00004], etire: 1, rugosite: [0.08, 20], teinte: [0.12, 14], crasse: 0 },
    physique: { roughness: 0.9, metalness: 0 },
    ombre: true,
  },
  // Sol d'atelier en résine : reflets inégaux, taches d'usage.
  sol: {
    grain: { relief: [180, 0.00002], etire: 1, rugosite: [0.34, 0.9], teinte: [0.09, 0.8], crasse: 0 },
    physique: { roughness: 0.4, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.28 },
    ombre: false,
  },
  // Lignes de sécurité peintes au sol, usées par le passage.
  marquage: {
    grain: { relief: [240, 0.00002], etire: 1, rugosite: [0.2, 6], teinte: [0.22, 4], crasse: 0 },
    physique: { roughness: 0.55, metalness: 0 },
    ombre: false,
  },
  // Carters en polycarbonate : transparents, mais ils reflètent.
  verre: {
    grain: { relief: [0, 0], etire: 1, rugosite: [0.02, 3], teinte: [0, 1], crasse: 0 },
    physique: { roughness: 0.04, metalness: 0, ior: 1.58, specularIntensity: 1, envMapIntensity: 1.6 },
    ombre: false,
  },
  // Pots d'encre, repères de couleur : plastique moulé, brillant.
  plastique: {
    grain: { relief: [600, 0.000008], etire: 1, rugosite: [0.08, 12], teinte: [0.05, 3], crasse: 0.1 },
    physique: { roughness: 0.3, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.2 },
    ombre: true,
  },
  // Pièces dont l'aspect vient de leur texture (bobines, étiquettes, cadrans) : la texture suffit, à peine nuancée.
  imprime: {
    grain: { relief: [0, 0], etire: 1, rugosite: [0.05, 25], teinte: [0.02, 6], crasse: 0 },
    physique: {},
    ombre: true,
  },
};

/** Uniformes du grain, propres à chaque matériau. */
export interface UniformesGrain {
  uEvanRelief: THREE.IUniform<THREE.Vector2>;
  uEvanEtire: THREE.IUniform<THREE.Vector3>;
  uEvanRugo: THREE.IUniform<THREE.Vector2>;
  uEvanNuance: THREE.IUniform<THREE.Vector2>;
  uEvanCrasse: THREE.IUniform<number>;
}

const VERTEX_DECL = 'varying vec3 vEvanObj;\nvarying float vEvanHaut;\n';
// Repère de la pièce, en mètres (l'échelle du nœud comprise), et hauteur au-dessus du sol.
const VERTEX_FIN = `
  vEvanObj = transformed * vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), length(modelMatrix[2].xyz));
  #ifdef USE_INSTANCING
    vEvanHaut = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
  #else
    vEvanHaut = (modelMatrix * vec4(transformed, 1.0)).y;
  #endif`;

const FRAGMENT_DECL = `varying vec3 vEvanObj;
varying float vEvanHaut;
uniform vec2 uEvanRelief;
uniform vec3 uEvanEtire;
uniform vec2 uEvanRugo;
uniform vec2 uEvanNuance;
uniform float uEvanCrasse;
`;
// Après les déclarations du shader (vViewPosition en fait partie).
const FRAGMENT_FONCTIONS = `
float evanHachis(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float evanBruit(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(evanHachis(i), evanHachis(i + vec3(1, 0, 0)), f.x), mix(evanHachis(i + vec3(0, 1, 0)), evanHachis(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(evanHachis(i + vec3(0, 0, 1)), evanHachis(i + vec3(1, 0, 1)), f.x), mix(evanHachis(i + vec3(0, 1, 1)), evanHachis(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float evanFbm(vec3 p) {
  return 0.5 * evanBruit(p) + 0.3 * evanBruit(p * 2.03 + 7.1) + 0.2 * evanBruit(p * 4.01 + 3.7);
}
// Relief sans coordonnées de texture (Mikkelsen) : la normale suit les dérivées écran de la hauteur.
vec3 evanRelief(vec3 n, float h, float face) {
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1) * face;
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

const COULEUR = `#include <color_fragment>
  {
    vec3 evanQ = vEvanObj * uEvanNuance.y;
    float evanT = 0.65 * evanBruit(evanQ) + 0.35 * evanBruit(evanQ * 2.03 + 7.1);
    diffuseColor.rgb *= 1.0 + (evanT - 0.5) * 2.0 * uEvanNuance.x;
    diffuseColor.rgb *= mix(1.0 - uEvanCrasse, 1.0, smoothstep(0.02, 0.42, vEvanHaut));
  }`;

const RUGOSITE = `#include <roughnessmap_fragment>
  {
    vec3 evanP = vEvanObj * uEvanEtire * uEvanRugo.y;
    float evanAa = 1.0 - smoothstep(0.6, 1.6, length(fwidth(evanP)));
    roughnessFactor = clamp(roughnessFactor + (evanBruit(evanP) - 0.5) * 2.0 * uEvanRugo.x * evanAa, 0.03, 1.0);
  }`;

const NORMALE = `#include <normal_fragment_maps>
  if (uEvanRelief.y > 0.0) {
    vec3 evanP = vEvanObj * uEvanEtire * uEvanRelief.x;
    // Plus fin qu'un pixel, le relief ne ferait que scintiller : il s'efface. Les dérivées sont calculées pour tous
    // les pixels (pas de branche qui dépende du pixel : elles y seraient indéfinies).
    float evanAa = 1.0 - smoothstep(0.35, 0.9, length(fwidth(evanP)));
    normal = normalize(mix(normal, evanRelief(normal, evanFbm(evanP) * uEvanRelief.y * evanAa, faceDirection), evanAa));
  }`;

/** Clé commune : le code ajouté est le même pour toutes les matières, seules les valeurs des uniformes changent. */
export const CLE_MATIERE = 'evan-matiere';

/** Ajoute le grain à un matériau standard ou physique. */
export function greffer(mat: THREE.MeshStandardMaterial, u: UniformesGrain) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = VERTEX_DECL + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>${VERTEX_FIN}`);
    shader.fragmentShader =
      FRAGMENT_DECL +
      shader.fragmentShader
        .replace('#include <common>', `#include <common>${FRAGMENT_FONCTIONS}`)
        .replace('#include <color_fragment>', COULEUR)
        .replace('#include <roughnessmap_fragment>', RUGOSITE)
        .replace('#include <normal_fragment_maps>', NORMALE);
  };
  mat.customProgramCacheKey = () => CLE_MATIERE;
}

/** Axe long d'une géométrie, dans son repère : les stries de tournage tournent autour. */
function axeLong(g: THREE.BufferGeometry): THREE.Vector3 {
  if (!g.boundingBox) g.computeBoundingBox();
  const t = g.boundingBox!.getSize(new THREE.Vector3());
  return t.x >= t.y && t.x >= t.z ? new THREE.Vector3(1, 0, 0) : t.y >= t.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
}

export function uniformesGrain(g: Grain, axe = new THREE.Vector3(0, 1, 0)): UniformesGrain {
  // Les stries varient vite selon l'axe et lentement autour : des anneaux, comme sur une pièce tournée.
  const etire = new THREE.Vector3(1, 1, 1).addScaledVector(axe, g.etire - 1);
  return {
    uEvanRelief: { value: new THREE.Vector2(...g.relief) },
    uEvanEtire: { value: etire },
    uEvanRugo: { value: new THREE.Vector2(...g.rugosite) },
    uEvanNuance: { value: new THREE.Vector2(...g.teinte) },
    uEvanCrasse: { value: g.crasse },
  };
}

export function signature(m: THREE.Material, mesh: THREE.Mesh): Signature {
  const s = m as THREE.MeshStandardMaterial;
  const c = s.color ?? new THREE.Color(1, 1, 1);
  return {
    couleur: [c.r, c.g, c.b],
    metal: s.metalness ?? 0,
    rugosite: s.roughness ?? 1,
    opacite: m.transparent ? m.opacity : 1,
    texture: !!s.map,
    emissif: !!s.emissive && s.emissive.getHex() !== 0,
    eclaire: !!(s as THREE.MeshStandardMaterial).isMeshStandardMaterial,
    nom: mesh.name,
  };
}

/** Matériau physique d'une classe, à partir de celui du kit (couleur, texture, transparence gardées). */
export function materiauPhysique(c: Classe, source: THREE.MeshStandardMaterial, axe?: THREE.Vector3): THREE.MeshPhysicalMaterial {
  const r = RECETTES[c];
  const m = new THREE.MeshPhysicalMaterial({
    name: source.name,
    color: source.color.clone(),
    map: source.map,
    alphaMap: source.alphaMap,
    normalMap: source.normalMap,
    transparent: source.transparent,
    opacity: source.opacity,
    alphaTest: source.alphaTest,
    side: source.side,
    vertexColors: source.vertexColors,
    flatShading: source.flatShading,
    depthWrite: source.depthWrite,
    roughness: source.roughness,
    metalness: source.metalness,
  });
  Object.assign(m, r.physique);
  if (r.plancher !== undefined) m.color.setRGB(Math.max(m.color.r, r.plancher), Math.max(m.color.g, r.plancher), Math.max(m.color.b, r.plancher));
  if (r.lustre) m.sheenColor.set(r.lustre);
  if (m.map) m.map.anisotropy = 8;
  greffer(m, uniformesGrain(r.grain, axe));
  return m;
}

/** Ce qui porte une ombre : ni le sol, ni les carters transparents. */
export const porteOmbre = (c: Classe | null) => (c ? RECETTES[c].ombre : false);

/** Habillage de la presse de l'accueil, partagé par toutes ses instances (identité stable pour MachineModel). */
export const HABILLAGE_PRESSE: Habillage = {
  ombres: true,
  materiau(m, mesh, owned) {
    const c = classer(signature(m, mesh));
    if (!c) {
      // Écrans, voyants, ombre peinte : ni ombre portée, ni grain.
      mesh.castShadow = false;
      return m;
    }
    const source = m as THREE.MeshStandardMaterial;
    if (source.map) {
      const fine = affinerTexture(source.map, c);
      if (fine !== source.map) {
        owned.add(fine);
        source.map = fine;
      }
    }
    const axe = c === 'chrome' || c === 'acier' ? axeLong(mesh.geometry) : undefined;
    // Une pièce à plusieurs matériaux porte une ombre si l'un d'eux en porte une.
    if (!porteOmbre(c) && (!Array.isArray(mesh.material) || mesh.material.length === 1)) mesh.castShadow = false;
    return materiauPhysique(c, source, axe);
  },
};
