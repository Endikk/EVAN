/**
 * Serveur statique du film produit : la page de montage, three (dépendances du front), les modèles et le kit du
 * dépôt, les captures et le plan filmé du dossier travail/. Écoute sur 127.0.0.1:5310.
 */
const http = require('node:http');
const { createReadStream, existsSync, statSync } = require('node:fs');
const { join, extname, normalize, resolve } = require('node:path');
const DEPOT = resolve(__dirname, '../../..');
const NM = join(DEPOT, 'src/EVAN.Front/node_modules');
const ROUTES = [
  ['/three/', join(NM, 'three/')],
  ['/modeles/', join(DEPOT, 'data/kit/modeles/')],
  ['/kit/', join(DEPOT, 'data/kit/')],
  ['/donnees/', join(DEPOT, 'data/')],
  ['/sans/', join(NM, '@fontsource-variable/ibm-plex-sans/files/')],
  ['/mono/', join(NM, '@fontsource/ibm-plex-mono/files/')],
  ['/media/', join(DEPOT, 'docs/media/')],
  ['/ecrans/', join(__dirname, 'travail/ecrans/')],
  ['/clips/', join(__dirname, 'travail/clips/')],
  ['/', __dirname + '/'],
];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http
  .createServer((req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const [prefixe, base] = ROUTES.find(([p]) => chemin.startsWith(p));
    const fichier = normalize(join(base, chemin.slice(prefixe.length)));
    if (!fichier.startsWith(base) || !existsSync(fichier) || !statSync(fichier).isFile()) {
      res.writeHead(404);
      return res.end('introuvable');
    }
    res.writeHead(200, { 'content-type': TYPES[extname(fichier)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(fichier).pipe(res);
  })
  .listen(5310, '127.0.0.1', () => console.log('film : http://127.0.0.1:5310/film.html'));
