import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
// Le décodeur que charge le navigateur (drei → three-stdlib), pas celui du build : un format qu'il ne lirait pas
// échouerait ici.
import { MeshoptDecoder } from 'three-stdlib';
import { allegerModele } from './modelesKit';

const kit = fileURLToPath(new URL('../../../data/kit/modeles/', import.meta.url));
const modeles = readdirSync(kit).filter((f) => f.endsWith('.glb'));

async function lire(glb: Uint8Array): Promise<Document> {
  const decodeur = MeshoptDecoder();
  await decodeur.ready;
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': decodeur }).readBinary(glb);
}

/**
 * Triangles d'une liste d'indices, chacun tourné pour commencer par son plus petit sommet : le codec Meshopt peut
 * faire tourner les trois sommets d'un triangle (même face, même sens, même ordre des triangles), rien de plus.
 */
function triangles(indices: ArrayLike<number>): string[] {
  const t: string[] = [];
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const v = [indices[i], indices[i + 1], indices[i + 2]];
    const k = v.indexOf(Math.min(...v));
    t.push([v[k], v[(k + 1) % 3], v[(k + 2) % 3]].join(','));
  }
  return t;
}

/**
 * Position, rotation et échelle d'un nœud : le modèle d'origine les écrit en matrice, la réécriture en
 * translation-rotation-échelle ; l'écart est de l'ordre de 1e-16, bien en deçà de la précision du GPU (float32).
 */
const trs = (v: readonly number[]) => v.map((x) => +x.toPrecision(12) + 0);

/** Ce qui doit survivre à la compression : arbre des nœuds, extras, matériaux, chaque sommet à l'octet près, chaque face. */
function empreinte(doc: Document) {
  const racine = doc.getRoot();
  return {
    noeuds: racine.listNodes().map((n) => ({
      nom: n.getName(),
      extras: n.getExtras(),
      t: trs(n.getTranslation()),
      r: trs(n.getRotation()),
      s: trs(n.getScale()),
      enfants: n.listChildren().map((c) => c.getName()),
      maillage: n.getMesh()?.getName() ?? null,
    })),
    materiaux: racine.listMaterials().map((m) => ({
      nom: m.getName(),
      extras: m.getExtras(),
      extensions: m.listExtensions().map((e) => e.extensionName),
      couleur: m.getBaseColorFactor(),
      rugosite: m.getRoughnessFactor(),
      metal: m.getMetallicFactor(),
      emissif: m.getEmissiveFactor(),
      alpha: [m.getAlphaMode(), m.getAlphaCutoff(), m.getDoubleSided()],
      texture: m.getBaseColorTexture() ? racine.listTextures().indexOf(m.getBaseColorTexture()!) : -1,
      echantillon: m.getBaseColorTextureInfo() && {
        wrap: [m.getBaseColorTextureInfo()!.getWrapS(), m.getBaseColorTextureInfo()!.getWrapT()],
        filtre: [m.getBaseColorTextureInfo()!.getMagFilter(), m.getBaseColorTextureInfo()!.getMinFilter()],
      },
    })),
    primitives: racine.listMeshes().flatMap((m) =>
      m.listPrimitives().map((p) => ({
        mode: p.getMode(),
        materiau: racine.listMaterials().indexOf(p.getMaterial()!),
        indices: p.getMode() === 4 ? triangles(p.getIndices()?.getArray() ?? []) : Array.from(p.getIndices()?.getArray() ?? []),
        attributs: Object.fromEntries(
          p.listSemantics().map((s) => {
            const a = p.getAttribute(s)!;
            return [s, { type: a.getArray()!.constructor.name, normalise: a.getNormalized(), octets: Buffer.from(a.getArray()!.buffer, a.getArray()!.byteOffset, a.getArray()!.byteLength).toString('base64') }];
          }),
        ),
      })),
    ),
  };
}

async function pixels(image: Uint8Array): Promise<Buffer> {
  return sharp(image).ensureAlpha().raw().toBuffer();
}

describe('modèles du kit allégés au build', () => {
  it.each(modeles)('%s : même géométrie, mêmes pixels, au moins un tiers plus léger', async (fichier) => {
    const source = new Uint8Array(readFileSync(kit + fichier));
    const allege = await allegerModele(source);

    const avant = await lire(source);
    const apres = await lire(allege);
    expect(apres.getRoot().listExtensionsUsed().map((e) => e.extensionName).sort()).toEqual(
      expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']),
    );
    expect(empreinte(apres)).toEqual(empreinte(avant));

    const texAvant = avant.getRoot().listTextures();
    const texApres = apres.getRoot().listTextures();
    expect(texApres).toHaveLength(texAvant.length);
    for (let i = 0; i < texAvant.length; i++) {
      expect(texApres[i].getMimeType()).toBe('image/webp');
      expect(texApres[i].getSize()).toEqual(texAvant[i].getSize());
      expect((await pixels(texApres[i].getImage()!)).equals(await pixels(texAvant[i].getImage()!))).toBe(true);
    }

    expect(allege.length).toBeLessThan(source.length * 0.67);
  }, 20_000);

  it('laisse tel quel un modèle déjà compressé', async () => {
    const une = await allegerModele(new Uint8Array(readFileSync(kit + modeles[0])));
    expect(await allegerModele(une)).toBe(une);
  });
});
