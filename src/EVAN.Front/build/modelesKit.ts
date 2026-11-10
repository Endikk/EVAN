/**
 * Modèles glTF du kit, allégés au build (vite.config.ts) : textures en WebP sans perte, données des maillages
 * compressées par Meshopt. Les deux sont réversibles à l'octet près : mêmes sommets, mêmes faces, mêmes pixels,
 * mêmes nœuds et extras. Seul le poids change : environ moitié moins d'octets transférés (gzip compris).
 *
 * Pas de quantification des sommets : mergedModel.ts ne fusionne que des attributs Float32, et la version allégée
 * des machines (une trentaine d'appels de dessin au lieu de plusieurs centaines) en dépend.
 *
 * Le décodage est déjà en place côté navigateur : useGLTF (drei) branche le décodeur Meshopt, que la politique de
 * contenu autorise ('wasm-unsafe-eval'), et GLTFLoader lit EXT_texture_webp.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

async function lecteur(): Promise<NodeIO> {
  await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
  return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });
}

/** Un modèle .glb allégé, sans perte. Un modèle déjà compressé ressort tel quel, une texture qui grossirait aussi. */
export async function allegerModele(glb: Uint8Array): Promise<Uint8Array> {
  const io = await lecteur();
  const doc = await io.readBinary(glb);
  const racine = doc.getRoot();
  if (racine.listExtensionsUsed().some((e) => e.extensionName === EXTMeshoptCompression.EXTENSION_NAME)) return glb;

  let webp = 0;
  for (const texture of racine.listTextures()) {
    const image = texture.getImage();
    if (!image || texture.getMimeType() !== 'image/png') continue;
    // exact : les couleurs sous un pixel transparent sont gardées (le filtrage des textures les mélange aux voisins).
    const sortie = await sharp(image).webp({ lossless: true, exact: true, effort: 6 }).toBuffer();
    if (sortie.length >= image.length) continue;
    texture.setImage(new Uint8Array(sortie)).setMimeType('image/webp');
    webp++;
  }
  if (webp) doc.createExtension(EXTTextureWebP).setRequired(true);

  // Méthode QUANTIZE : aucun filtre (les filtres Meshopt perdent de la précision), données Float32 conservées.
  doc
    .createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  return io.writeBinary(doc);
}
