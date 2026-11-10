import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { partageAbsolu, urlPublique } from './build/publication.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Données partagées avec le back (racine du dépôt) : catalogue, usine d'exemple, kit machines. */
const dataDir = path.resolve(here, '../../data');
const kitModels = path.join(dataDir, 'kit/modeles');

/** Alias communs à Vite et Vitest. */
export const alias = {
  '@': path.resolve(here, 'src'),
  '@data': dataDir,
};

/**
 * Sert les modèles glTF du kit (data/kit/modeles) sous /kit/modeles en dev, tels quels,
 * et les écrit allégés dans dist/kit/modeles au build (build/modelesKit.ts : textures WebP et Meshopt, sans perte,
 * moitié moins d'octets). Le kit reste la seule source de vérité.
 */
function kitModelsPlugin(): Plugin {
  return {
    name: 'evan-kit-models',
    configureServer(server) {
      server.middlewares.use('/kit/modeles', (req, res, next) => {
        const name = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');
        const file = path.resolve(kitModels, name);
        if (!file.startsWith(kitModels) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return next();
        res.setHeader('Content-Type', 'model/gltf-binary');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        fs.createReadStream(file).pipe(res);
      });
    },
    async generateBundle() {
      // Chargé ici seulement : Vitest lit aussi ce fichier (alias) et n'a pas besoin de sharp ni de Meshopt.
      const { allegerModele } = await import('./build/modelesKit.ts');
      const fichiers = fs.readdirSync(kitModels).filter((f) => f.endsWith('.glb'));
      const alleges = await Promise.all(fichiers.map((f) => allegerModele(fs.readFileSync(path.join(kitModels, f)))));
      fichiers.forEach((f, i) => this.emitFile({ type: 'asset', fileName: `kit/modeles/${f}`, source: alleges[i] }));
    },
  };
}

/**
 * Adresse du site (EVAN_URL_PUBLIQUE, build/publication.ts) : balises de partage en adresses absolues. Variable
 * absente : index.html tel quel.
 */
function publicationPlugin(): Plugin {
  let base: string | null = null;
  return {
    name: 'evan-publication',
    apply: 'build',
    // Lue au build seulement : une adresse mal formée arrête le build, pas le serveur de dev ni les tests.
    configResolved() {
      base = urlPublique(process.env.EVAN_URL_PUBLIQUE);
    },
    transformIndexHtml: (html) => (base ? partageAbsolu(html, base) : html),
  };
}

export default defineConfig({
  plugins: [react(), kitModelsPlugin(), publicationPlugin()],
  resolve: { alias },
  server: {
    port: 5173,
    fs: { allow: [here, dataDir] },
    // Back optionnel : EVAN_API=http://localhost:8080 npm run dev. Sans lui, le simulateur du navigateur prend le relais.
    // xfwd : le back voit l'adresse du navigateur (X-Forwarded-For) ; avec `--host`, un poste du réseau n'est pas pris
    // pour le poste local, et l'assistant lui demande le code d'accès.
    proxy: process.env.EVAN_API
      ? {
          '/api': { target: process.env.EVAN_API, changeOrigin: true, xfwd: true },
          '/hubs': { target: process.env.EVAN_API, changeOrigin: true, ws: true, xfwd: true },
        }
      : undefined,
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        // Bibliothèques dans leurs propres fichiers : un déploiement qui ne touche que le code d'EVAN laisse ces
        // fichiers inchangés, donc en cache chez le navigateur (assets immuables, servis un an).
        // Un groupe emporte aussi les dépendances de ses modules : zustand, dont se sert @react-three/fiber, finissait
        // dans `three`, et tout écran qui lit un store (l'accueil compris) attendait Three.js avant son premier rendu.
        // Rangé avec React, il sort de `three` : le groupe `react` passe en premier.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|zustand|use-sync-external-store)[\\/]/ },
            { name: 'three', test: /node_modules[\\/](three|three-stdlib|three-mesh-bvh|@react-three|troika-[^\\/]+|camera-controls|maath|meshline|stats-gl|detect-gpu|@monogrid|suspend-react|its-fine)[\\/]/ },
            { name: 'maplibre', test: /node_modules[\\/](maplibre-gl|@maplibre)[\\/]/ },
            { name: 'charts', test: /node_modules[\\/](recharts|victory-vendor|d3-[^\\/]+|decimal\.js-light|@reduxjs|react-redux|redux|reselect|immer|es-toolkit|eventemitter3)[\\/]/ },
          ],
        },
      },
    },
  },
});
