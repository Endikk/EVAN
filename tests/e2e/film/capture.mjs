/**
 * Rend le film d'ouverture de l'accueil image par image, pour le relire : la page est ouverte en `?film=capture`,
 * chaque image est placée par window.__evanFilm.aller(f) puis photographiée. Docs : docs/film-accueil/ledger.md.
 *
 *   node film/capture.mjs --sortie /tmp/film/bureau --taille 1728x1000
 *   node film/capture.mjs --sortie /tmp/film/tel --taille 390x844 --dpr 2 --theme jour --pas 3
 *   ffmpeg -framerate 60 -i /tmp/film/bureau/f%04d.png -frames:v 390 -c:v libx264 -pix_fmt yuv420p film.mp4
 *
 * Options : --url (défaut http://localhost:5173/), --taille LxH, --dpr, --theme nuit|jour, --de, --a, --pas.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const url = new URL(args.url ?? 'http://localhost:5173/');
url.searchParams.set('film', 'capture');
const [w, h] = (args.taille ?? '1728x1000').split('x').map(Number);
const dpr = Number(args.dpr ?? 1);
const theme = args.theme === 'jour' ? 'light' : 'dark';
const sortie = args.sortie ?? 'film-images';
const pas = Number(args.pas ?? 1);
mkdirSync(sortie, { recursive: true });

// Rendu par la carte graphique (Metal sur Mac) : sans elle, la presse 3D se dessine en logiciel, très lentement.
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, locale: 'fr-FR', reducedMotion: 'no-preference' });
await ctx.addInitScript((t) => localStorage.setItem('evan.theme', t), theme);
const page = await ctx.newPage();
page.on('pageerror', (e) => console.error('page :', e.message));
await page.goto(url.toString(), { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__evanFilm, null, { timeout: 30_000 });
await page.evaluate(() => window.__evanFilm.pret);
const fin = await page.evaluate(() => window.__evanFilm.fin);
const de = Number(args.de ?? 0);
const a = Math.min(fin, Number(args.a ?? fin));

const t0 = Date.now();
// Les images se suivent dans l'ordre : la 3D intègre la rotation des rouleaux d'une image à la suivante.
for (let f = 0; f <= a; f++) {
  await page.evaluate(
    (i) =>
      new Promise((ok) => {
        window.__evanFilm.aller(i);
        requestAnimationFrame(() => requestAnimationFrame(ok));
      }),
    f,
  );
  if (f >= de && (f - de) % pas === 0) await page.screenshot({ path: join(sortie, `f${String(f).padStart(4, '0')}.png`) });
}
console.log(`${a - de + 1} images (${w}×${h} à ${dpr}x, ${theme}) en ${((Date.now() - t0) / 1000).toFixed(1)} s → ${sortie}`);
await browser.close();
