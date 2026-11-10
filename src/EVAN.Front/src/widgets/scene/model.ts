/**
 * Instanciation d'un modèle du kit et repérage des nœuds animés :
 * rotatif_N (rotation autour de Y local à extras.vitesseRadS), bande_N (défilement de la texture
 * en U à vitesseMS / pasEtiquetteM), voyant_vert/orange/rouge, diag_N_nom (points de diagnostic),
 * repere_nom (légendes). GLTFLoader place les extras glTF dans userData.
 */
import * as THREE from 'three';

export interface VoyantRef {
  mats: (THREE.MeshStandardMaterial | THREE.MeshBasicMaterial)[];
  base: THREE.Color[];
}

export interface ModelInstance {
  root: THREE.Object3D;
  rotatifs: { o: THREE.Object3D; speed: number }[];
  bandes: { tex: THREE.Texture; rate: number }[];
  voyants: Record<CouleurVoyant, VoyantRef>;
  diag: Map<number, THREE.Object3D>;
  reperes: { o: THREE.Object3D; texte: string }[];
  meshes: THREE.Mesh[];
  /** Matériaux d'origine (pour restaurer après une mise en évidence). */
  original: Map<THREE.Material, { emissive?: THREE.Color; emissiveIntensity?: number; opacity: number; transparent: boolean }>;
  size: THREE.Vector3;
  /** Textures copiées pour cette instance (bandes), à libérer avec elle. */
  ownedTextures: Set<THREE.Texture>;
}

/** Une bande défile en décalant sa texture : seule celle-ci doit être propre à l'instance. */
function isInBande(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if ((p.userData as Record<string, unknown>).role === 'bande') return true;
  return false;
}

/**
 * Matériau propre à l'instance (voyants, mise en évidence). La texture reste partagée avec le cache de useGLTF,
 * sauf sur une bande : une copie de texture est un second envoi de l'image au GPU, par machine.
 */
function cloneMaterial(m: THREE.Material, ownMap: boolean, owned: Set<THREE.Texture>): THREE.Material {
  const c = m.clone();
  const std = c as THREE.MeshStandardMaterial;
  if (ownMap && std.map) {
    std.map = std.map.clone();
    owned.add(std.map);
  }
  return c;
}

export type CouleurVoyant = 'vert' | 'orange' | 'rouge';

export function voyantKey(o: THREE.Object3D): CouleurVoyant | null {
  return o.name.includes('vert') ? 'vert' : o.name.includes('orange') ? 'orange' : o.name.includes('rouge') ? 'rouge' : null;
}

export function emptyVoyants(): Record<CouleurVoyant, VoyantRef> {
  return { vert: { mats: [], base: [] }, orange: { mats: [], base: [] }, rouge: { mats: [], base: [] } };
}

/** Repère les matériaux d'un voyant (déjà propres à l'instance) et leur couleur de base. */
export function collectVoyant(o: THREE.Object3D, voyants: Record<CouleurVoyant, VoyantRef>) {
  const key = voyantKey(o);
  if (!key) return;
  o.traverse((c) => {
    const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && !Array.isArray(m)) {
      voyants[key].mats.push(m);
      voyants[key].base.push((m.emissive && m.emissive.getHex() ? m.emissive : m.color).clone());
    }
  });
}

/** Libère ce que l'instance a créé (matériaux et textures copiés). La géométrie appartient au cache de useGLTF. */
export function disposeInstance(inst: Pick<ModelInstance, 'meshes' | 'ownedTextures'>) {
  for (const m of inst.meshes) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose();
  inst.ownedTextures.forEach((t) => t.dispose());
}

/**
 * Habillage d'une instance (page d'accueil) : remplace le matériau propre à chaque maillage, juste après sa copie,
 * avant que l'instance ne repère voyants, bandes et matériaux d'origine. Les textures qu'il crée vont dans `owned`.
 */
export interface Habillage {
  materiau(m: THREE.Material, mesh: THREE.Mesh, owned: Set<THREE.Texture>): THREE.Material;
  /** Les maillages portent et reçoivent les ombres. */
  ombres: boolean;
}

export function instantiate(scene: THREE.Object3D, habillage?: Habillage): ModelInstance {
  const root = scene.clone(true);
  const ownedTextures = new Set<THREE.Texture>();
  const inst: ModelInstance = {
    root,
    rotatifs: [],
    bandes: [],
    voyants: emptyVoyants(),
    diag: new Map(),
    reperes: [],
    meshes: [],
    original: new Map(),
    size: new THREE.Vector3(),
    ownedTextures,
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const own = isInBande(mesh);
      // Réglées avant l'habillage, qui peut retirer l'ombre portée d'une matière (sol, carter transparent).
      mesh.castShadow = !!habillage?.ombres;
      mesh.receiveShadow = !!habillage?.ombres;
      const copie = (m: THREE.Material) => {
        const c = cloneMaterial(m, own, ownedTextures);
        if (!habillage) return c;
        const h = habillage.materiau(c, mesh, ownedTextures);
        if (h !== c) c.dispose();
        return h;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copie) : copie(mesh.material);
      inst.meshes.push(mesh);
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const s = mat as THREE.MeshStandardMaterial;
        inst.original.set(mat, {
          emissive: s.emissive?.clone(),
          emissiveIntensity: s.emissiveIntensity,
          opacity: mat.opacity,
          transparent: mat.transparent,
        });
      }
    }
  });
  root.traverse((o) => {
    const ud = o.userData as Record<string, unknown>;
    if (ud.role === 'rotatif' && typeof ud.vitesseRadS === 'number') inst.rotatifs.push({ o, speed: ud.vitesseRadS });
    if (ud.role === 'bande') {
      const rate = (Number(ud.vitesseMS) || 0.5) / (Number(ud.pasEtiquetteM) || 0.11);
      o.traverse((c) => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && !Array.isArray(m) && m.map) {
          if (m.map.wrapS !== THREE.RepeatWrapping) {
            m.map.wrapS = THREE.RepeatWrapping;
            m.map.needsUpdate = true;
          }
          inst.bandes.push({ tex: m.map, rate });
        }
      });
    }
    if (ud.role === 'voyant') collectVoyant(o, inst.voyants);
    if (o.name.startsWith('diag_') && typeof ud.numero === 'number') inst.diag.set(ud.numero, o);
    if (o.name.startsWith('repere_') && typeof ud.texte === 'string') inst.reperes.push({ o, texte: ud.texte });
  });
  new THREE.Box3().setFromObject(root).getSize(inst.size);
  return inst;
}

const tmpColor = new THREE.Color();

/** Allume ou éteint un voyant (intensité 0..1). */
export function setVoyant(v: VoyantRef, level: number) {
  v.mats.forEach((m, i) => {
    const base = v.base[i];
    const std = m as THREE.MeshStandardMaterial;
    if (std.emissive) {
      std.emissive.copy(base);
      // Éteint, un voyant doit se lire éteint : à peine teinté, sans lueur ; allumé, il garde sa couleur (au-delà, il
      // sature au blanc).
      std.emissiveIntensity = level * 1.8;
      tmpColor.copy(base).multiplyScalar(0.1 + level * 0.9);
      std.color.copy(tmpColor);
    } else {
      m.color.copy(base).multiplyScalar(0.25 + level * 1.2);
    }
  });
}

/** Met en évidence les maillages proches d'un point (monde), estompe le reste de la machine. */
export function highlightNear(inst: ModelInstance, world: THREE.Vector3, color: THREE.Color | null, radius = 0.42, ghost = 0.22): THREE.Mesh[] {
  const center = new THREE.Vector3();
  const box = new THREE.Box3();
  const scored: { m: THREE.Mesh; d: number }[] = [];
  for (const m of inst.meshes) {
    if (!m.visible) continue;
    box.setFromObject(m);
    if (box.isEmpty()) continue;
    box.getCenter(center);
    const sizeLen = box.getSize(new THREE.Vector3()).length();
    if (sizeLen > 3.5) continue; // socle, carters et grands volumes exclus
    scored.push({ m, d: box.distanceToPoint(world) });
  }
  scored.sort((a, b) => a.d - b.d);
  const hits = scored.filter((s) => s.d <= radius).map((s) => s.m);
  if (!hits.length && scored[0]) hits.push(scored[0].m);
  resetHighlight(inst);
  if (!color) return hits;
  const hitSet = new Set(hits);
  for (const m of inst.meshes) {
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const std = mat as THREE.MeshStandardMaterial;
      if (hitSet.has(m)) {
        if (std.emissive) {
          std.emissive.copy(color);
          std.emissiveIntensity = 0.9;
        }
      } else {
        mat.transparent = true;
        mat.opacity = ghost;
        mat.depthWrite = false;
      }
      mat.needsUpdate = true;
    }
  }
  return hits;
}

export function resetHighlight(inst: ModelInstance) {
  for (const m of inst.meshes) {
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      const o = inst.original.get(mat);
      if (!o) continue;
      const std = mat as THREE.MeshStandardMaterial;
      if (std.emissive && o.emissive) std.emissive.copy(o.emissive);
      if (o.emissiveIntensity !== undefined) std.emissiveIntensity = o.emissiveIntensity;
      mat.opacity = o.opacity;
      mat.transparent = o.transparent;
      mat.depthWrite = true;
      mat.needsUpdate = true;
    }
  }
}
