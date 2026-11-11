/**
 * Icônes et image de partage, générées une fois et versionnées dans public/ : `npm run icones` après un changement de
 * public/favicon.svg ou de la capture. Lancé par Node seul (types retirés à la volée, Node 22.18 ou plus récent).
 *
 * Sources : public/favicon.svg (le « e » et son point d'état, mêmes tracés que src/ui/brand.ts) et
 * docs/media/supervision.avif, une vraie capture de la supervision de la démo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const front = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(front, 'public');
const capture = path.resolve(front, '../../docs/media/supervision.avif');

/** Fond des icônes pleines : celui du favicon (--bg de la nuit). */
const FOND = '#0d1f33';

/**
 * Plein : sans coin transparent. iOS arrondit lui-même l'icône de l'écran d'accueil et noircirait la transparence.
 */
const ICONES = [
  { fichier: 'favicon-32.png', taille: 32, plein: false },
  { fichier: 'apple-touch-icon.png', taille: 180, plein: true },
  { fichier: 'icone-192.png', taille: 192, plein: false },
  { fichier: 'icone-512.png', taille: 512, plein: false },
];

async function icones() {
  const svg = readFileSync(path.join(publicDir, 'favicon.svg'));
  for (const { fichier, taille, plein } of ICONES) {
    // Le SVG fait 64 unités : rendu à la densité qui donne la taille voulue, net plutôt qu'agrandi.
    let image = sharp(svg, { density: (72 * taille) / 64 }).resize(taille, taille);
    if (plein) image = image.flatten({ background: FOND });
    const sortie = path.join(publicDir, fichier);
    const info = await image.png({ compressionLevel: 9, palette: true }).toFile(sortie);
    console.log(`${fichier} : ${info.width}×${info.height}, ${info.size} octets`);
  }
}

/** Image de partage (Open Graph, Twitter) : 1200×630, la capture recadrée par le haut (barre, indicateurs, plan). */
async function partage() {
  const info = await sharp(capture)
    .resize(1200, 630, { fit: 'cover', position: 'top' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(path.join(publicDir, 'partage.jpg'));
  console.log(`partage.jpg : ${info.width}×${info.height}, ${info.size} octets`);
}

await icones();
await partage();
