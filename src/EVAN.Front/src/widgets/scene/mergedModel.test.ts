import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { instantiateFast } from './mergedModel';

/** Machine factice : dix pièces fixes en deux matériaux, un rouleau, une pièce en miroir et un voyant. */
function fakeMachine() {
  const scene = new THREE.Group();
  const acier = new THREE.MeshStandardMaterial({ color: '#8899aa', roughness: 0.4, metalness: 0.6 });
  const peinture = new THREE.MeshStandardMaterial({ color: '#cc3300', roughness: 0.4, metalness: 0.6 });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), i % 2 ? acier : peinture);
    m.position.set(i * 2, 0, 0);
    scene.add(m);
  }
  const rouleau = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1), acier);
  rouleau.userData = { role: 'rotatif', vitesseRadS: 3 };
  scene.add(rouleau);
  const miroir = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), acier);
  miroir.scale.set(-1, 1, 1);
  scene.add(miroir);
  const voyant = new THREE.Group();
  voyant.name = 'voyant_vert';
  voyant.userData = { role: 'voyant' };
  voyant.position.set(0, 2, 0);
  voyant.add(new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial({ color: '#00ff00', emissive: '#00ff00' })));
  scene.add(voyant);
  return { scene, acier, peinture };
}

const meshesOf = (o: THREE.Object3D) => {
  const out: THREE.Mesh[] = [];
  o.traverse((c) => (c as THREE.Mesh).isMesh && out.push(c as THREE.Mesh));
  return out;
};

describe('modèle fusionné de la vue d’ensemble', () => {
  it('dessine les pièces fixes en un seul maillage quand seule la couleur diffère, le voyant à part', () => {
    const { scene } = fakeMachine();
    const fast = instantiateFast(scene);
    // La couleur passe aux sommets : rouge et acier (rouleau et miroir compris, figés à cette distance) ne font qu'un
    // maillage. Avec le voyant : 2 appels de dessin au lieu de 13.
    expect(meshesOf(fast.root)).toHaveLength(2);
    expect(fast.voyants.vert.mats).toHaveLength(1);
  });

  it('sépare les pièces dont le rendu diffère autrement que par la couleur', () => {
    const { scene } = fakeMachine();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat));
    expect(meshesOf(instantiateFast(scene).root)).toHaveLength(3);
  });

  it('garde la couleur de chaque pièce sur ses sommets', () => {
    const { scene, peinture } = fakeMachine();
    const fast = instantiateFast(scene);
    const rouge = meshesOf(fast.root).find((m) => {
      const c = m.geometry.getAttribute('color');
      return c && Math.abs(c.getX(0) - peinture.color.r) < 1e-6 && Math.abs(c.getY(0) - peinture.color.g) < 1e-6;
    });
    expect(rouge).toBeDefined();
    expect((rouge!.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
  });

  it('place chaque pièce à sa position dans le modèle', () => {
    const { scene } = fakeMachine();
    const fast = instantiateFast(scene);
    const all = new THREE.Box3().setFromObject(fast.root);
    const ref = new THREE.Box3().setFromObject(scene);
    expect(all.min.distanceTo(ref.min)).toBeLessThan(1e-6);
    expect(all.max.distanceTo(ref.max)).toBeLessThan(1e-6);
  });

  it('partage la géométrie fusionnée entre les machines du même modèle, pas les voyants', () => {
    const { scene } = fakeMachine();
    const a = instantiateFast(scene);
    const b = instantiateFast(scene);
    const geoms = (f: typeof a) => meshesOf(f.root).filter((m) => !f.meshes.includes(m)).map((m) => m.geometry);
    expect(geoms(a)).toEqual(geoms(b));
    expect(a.voyants.vert.mats[0]).not.toBe(b.voyants.vert.mats[0]);
  });

  it('remet dans le bon sens les faces d’une pièce en miroir', () => {
    const scene = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial();
    const normal = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    const miroir = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    miroir.scale.set(-1, 1, 1);
    miroir.position.set(5, 0, 0);
    scene.add(normal, miroir);
    const [merged] = meshesOf(instantiateFast(scene).root);
    const pos = merged.geometry.getAttribute('position');
    const idx = merged.geometry.index!;
    const faceNormal = (tri: number) => {
      const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(pos, idx.getX(tri * 3 + k)));
      return new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    };
    // Plan d'origine orienté vers +Z ; le miroir en X doit rester visible du même côté.
    expect(faceNormal(0).z).toBeGreaterThan(0.99);
    expect(faceNormal(2).z).toBeGreaterThan(0.99);
  });
});
