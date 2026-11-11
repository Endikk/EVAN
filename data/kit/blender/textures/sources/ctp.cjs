// Textures de la machine ctp (afficheur du bain, plaque gravée), dessinées en SVG puis rendues en PNG par sharp.
// node data/kit/blender/textures/sources/ctp.cjs data/kit/blender/textures
const path = require('path');
// sharp vient des dépendances du front : pas de package.json à part pour deux images.
const sharp = require(path.join(__dirname, '..', '..', '..', '..', '..', 'src', 'EVAN.Front', 'node_modules', 'sharp'));
const sortie = process.argv[2];
const POLICE = 'Helvetica Neue, Helvetica, Arial';
// Les écrans ctp_ecran_*.png ne sont plus produits ici : ils sont refaits à part (textures/sources/ecrans.cjs).

// Afficheur de la développeuse : température du bain et temps de passage.
const bain = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="64">
<rect width="128" height="64" fill="#0d1a14"/>
<text x="8" y="18" font-family="${POLICE}" font-size="12" font-weight="700" fill="#7fd6a0">DÉV</text>
<text x="120" y="18" font-family="${POLICE}" font-size="11" fill="#7fd6a0" text-anchor="end">25 s</text>
<text x="8" y="54" font-family="${POLICE}" font-size="30" font-weight="700" fill="#b8f5cf">23,0</text>
<text x="120" y="54" font-family="${POLICE}" font-size="14" fill="#7fd6a0" text-anchor="end">°C</text>
</svg>`;

// Plaque gravée et développée : la couche (bleu) reste sur l'image, l'aluminium apparaît ailleurs. U suit le
// défilement (X), V la largeur (Y) : 0,52 m sur 0,62 m. Pinces et perforations côté avant (U = 1).
const W = 256, H = 304, ALU = '#c9cfd4', COUCHE = '#1f557a';
let motifs = '';
for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
  const x = 22 + i * 70, y = 26 + j * 66, w = 62, h = 58;
  let traits = '';
  for (let k = 0; k < 14; k++) traits += `<rect x="${x + 6 + k * 3.2}" y="${y + 8}" width="${k % 3 ? 1.4 : 2.4}" height="22" fill="${COUCHE}"/>`;
  motifs += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="none" stroke="${COUCHE}" stroke-width="2"/>
${traits}<rect x="${x + 6}" y="${y + 36}" width="${w - 16}" height="4" fill="${COUCHE}"/>
<rect x="${x + 6}" y="${y + 44}" width="${w - 28}" height="4" fill="${COUCHE}"/>`;
}
const croix = (x, y) => `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="${COUCHE}" stroke-width="1.5"/>
<path d="M${x - 8} ${y} h16 M${x} ${y - 8} v16" stroke="${COUCHE}" stroke-width="1.5"/>`;
const plaque = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
<rect width="${W}" height="${H}" fill="${ALU}"/>
${motifs}
${croix(11, 12)}${croix(11, H - 12)}${croix(W - 26, 12)}${croix(W - 26, H - 12)}
<rect x="${W - 14}" y="0" width="14" height="${H}" fill="#b7bec4"/>
${[0.2, 0.5, 0.8].map((f) => `<rect x="${W - 11}" y="${H * f - 9}" width="6" height="18" rx="3" fill="#59626a"/>`).join('')}
<text x="${W - 21}" y="${H / 2}" font-family="${POLICE}" font-size="10" fill="${COUCHE}" transform="rotate(-90 ${W - 21} ${H / 2})" text-anchor="middle">1187 · C</text>
</svg>`;

const travaux = [['ctp_afficheur_bain.png', bain], ['ctp_plaque_gravee.png', plaque]];
Promise.all(travaux.map(([nom, svg]) => sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(path.join(sortie, nom))
  .then(() => console.log('écrit', nom)))).catch((e) => { console.error(e); process.exit(1); });
