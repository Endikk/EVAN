/**
 * Version allégée d'un modèle pour la vue d'ensemble de l'usine. Les pièces sont fusionnées par matériau en quelques
 * maillages, calculés une fois par modèle et partagés par toutes les machines du même type : une presse de 380 pièces
 * passe de 380 appels de dessin par image à une trentaine. Les voyants restent à part (leur couleur suit l'état) ;
 * rouleaux et bande sont figés, leur mouvement ne se voit pas à cette distance. Le modèle détaillé (model.ts) prend le
 * relais de près et pour la mise en évidence d'un organe.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { collectVoyant, emptyVoyants, type CouleurVoyant, type VoyantRef } from './model';

interface MergedModel {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
  /** Nœuds gardés tels quels (voyants, maillages non fusionnables), placés dans le repère du modèle. */
  kept: { node: THREE.Object3D; matrix: THREE.Matrix4 }[];
  /** Sphère englobante dans le repère du modèle : taille à l'écran, choix du niveau de détail. */
  sphere: THREE.Sphere;
}

export interface FastInstance {
  root: THREE.Group;
  voyants: Record<CouleurVoyant, VoyantRef>;
  /** Maillages dont l'instance possède les matériaux (voyants et pièces gardées). */
  meshes: THREE.Mesh[];
  ownedTextures: Set<THREE.Texture>;
  sphere: THREE.Sphere;
}

/** Fusion calculée une fois par scène glTF (le cache de useGLTF la partage entre toutes les machines). */
const cache = new WeakMap<THREE.Object3D, MergedModel>();
const ATTRIBUTES = ['position', 'normal', 'uv'];

function textureKey(t: THREE.Texture | null | undefined): string {
  if (!t) return '-';
  return [t.source.uuid, t.wrapS, t.wrapT, t.flipY, t.colorSpace, t.offset.toArray(), t.repeat.toArray(), t.rotation].join(':');
}

/** Clé de regroupement : deux maillages de même clé se dessinent avec le même matériau, la couleur passant aux sommets. */
function materialKey(mat: THREE.Material): string | null {
  if (mat.type !== 'MeshStandardMaterial' && mat.type !== 'MeshBasicMaterial') return null;
  const b = mat as THREE.MeshBasicMaterial;
  if (b.vertexColors || b.alphaMap || b.aoMap || b.lightMap || b.envMap || b.specularMap) return null;
  const common = [mat.type, mat.side, mat.transparent, mat.opacity.toFixed(3), mat.alphaTest, mat.depthWrite, mat.depthTest, mat.blending, b.fog, mat.toneMapped, textureKey(b.map)];
  if (mat.type === 'MeshBasicMaterial') return common.join('|');
  const s = mat as THREE.MeshStandardMaterial;
  if (s.normalMap || s.roughnessMap || s.metalnessMap || s.emissiveMap || s.bumpMap || s.displacementMap) return null;
  return [...common, s.roughness.toFixed(3), s.metalness.toFixed(3), s.emissive.getHexString(), s.emissiveIntensity, s.envMapIntensity, s.flatShading].join('|');
}

/**
 * Géométrie fusionnable : position, normale et UV en Float32 non entrelacés, rien d'autre (ni couleur, ni morph).
 * Les groupes n'importent pas : le maillage n'a qu'un matériau (les matériaux multiples sont gardés à part).
 */
function attributeKey(g: THREE.BufferGeometry): string | null {
  if (Object.keys(g.morphAttributes).length) return null;
  const names = Object.keys(g.attributes);
  if (!names.includes('position') || names.some((n) => !ATTRIBUTES.includes(n))) return null;
  for (const n of names) {
    const a = g.attributes[n] as THREE.BufferAttribute;
    if (!(a.array instanceof Float32Array) || a.normalized || (a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return null;
  }
  return names.sort().join(',');
}

/** Copie de la géométrie dans le repère du modèle, indexée, avec la couleur du matériau sur chaque sommet. */
function bake(src: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const n of Object.keys(src.attributes)) g.setAttribute(n, (src.attributes[n] as THREE.BufferAttribute).clone());
  const count = g.attributes.position.count;
  if (src.index) g.setIndex(src.index.clone());
  else g.setIndex(Array.from({ length: count }, (_, i) => i));
  g.applyMatrix4(matrix);
  // Transformation miroir : l'ordre des sommets s'inverse, sinon les faces seraient vues de dos.
  if (matrix.determinant() < 0) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function build(scene: THREE.Object3D): MergedModel {
  scene.updateMatrixWorld(true);
  const toModel = scene.matrixWorld.clone().invert();
  const groups = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
  const kept: MergedModel['kept'] = [];
  const keep = (node: THREE.Object3D) => kept.push({ node, matrix: toModel.clone().multiply(node.matrixWorld) });

  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if ((o.userData as Record<string, unknown>).role === 'voyant') return keep(o);
    // Lignes, nuages de points et sprites ne se fusionnent pas : gardés tels quels plutôt que perdus.
    const autre = o as THREE.Object3D & { isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
    if (autre.isLine || autre.isPoints || autre.isSprite) return keep(o);
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const special = (mesh as THREE.SkinnedMesh).isSkinnedMesh || (mesh as THREE.InstancedMesh).isInstancedMesh;
      const mat = Array.isArray(mesh.material) ? null : mesh.material;
      const mk = mat && !special ? materialKey(mat) : null;
      const ak = mk ? attributeKey(mesh.geometry) : null;
      // Maillage gardé tel quel : ses enfants sont copiés avec lui.
      if (!mat || !mk || !ak) return keep(mesh);
      const key = `${mk}#${ak}`;
      let grp = groups.get(key);
      if (!grp) groups.set(key, (grp = { material: mat, geometries: [] }));
      grp.geometries.push(bake(mesh.geometry, toModel.clone().multiply(mesh.matrixWorld), (mat as THREE.MeshBasicMaterial).color));
    }
    o.children.forEach(visit);
  };
  scene.children.forEach(visit);

  const parts: MergedModel['parts'] = [];
  for (const { material, geometries } of groups.values()) {
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!geometry) continue;
    geometry.computeBoundingSphere();
    const m = material.clone() as THREE.MeshBasicMaterial;
    m.vertexColors = true;
    m.color.set(0xffffff);
    parts.push({ geometry, material: m });
  }
  const sphere = new THREE.Box3().setFromObject(scene).applyMatrix4(toModel).getBoundingSphere(new THREE.Sphere());
  return { parts, kept, sphere };
}

export function instantiateFast(scene: THREE.Object3D): FastInstance {
  let model = cache.get(scene);
  if (!model) cache.set(scene, (model = build(scene)));
  const root = new THREE.Group();
  // Même transformation de racine que la copie détaillée (scene.clone) : pas de saut au changement de version.
  root.position.copy(scene.position);
  root.quaternion.copy(scene.quaternion);
  root.scale.copy(scene.scale);
  for (const p of model.parts) root.add(new THREE.Mesh(p.geometry, p.material));
  const voyants = emptyVoyants();
  const meshes: THREE.Mesh[] = [];
  for (const k of model.kept) {
    const node = k.node.clone(true);
    k.matrix.decompose(node.position, node.quaternion, node.scale);
    node.traverse((c) => {
      const mesh = c as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      meshes.push(mesh);
    });
    if ((node.userData as Record<string, unknown>).role === 'voyant') collectVoyant(node, voyants);
    root.add(node);
  }
  // Rien ne bouge dans cette version : matrices locales calculées une fois.
  root.traverse((o) => {
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
  return { root, voyants, meshes, ownedTextures: new Set(), sphere: model.sphere };
}
