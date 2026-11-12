/**
 * Rend le film image par image (serveur.cjs doit tourner), dans travail/images.
 *   node rendre.cjs              tout le film
 *   node rendre.cjs essai 15     une image sur 15, dans travail/essai (relecture rapide)
 *   node rendre.cjs de 0 a 210   seulement ces images, par-dessus un rendu existant
 */
const { chromium } = require('@playwright/test');
const { mkdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const [mode, a1, , a3] = process.argv.slice(2);
const essai = mode === 'essai';
const partiel = mode === 'de';
const pas = essai ? Number(a1 ?? 20) : 1;
const dossier = join(__dirname, 'travail', essai ? 'essai' : 'images');
if (!partiel) rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
  page.on('pageerror', (e) => console.log('page :', e.message));
  await page.goto('http://127.0.0.1:5310/film.html');
  await page.waitForFunction(() => !!window.film, null, { timeout: 60000 });
  await page.evaluate(() => window.film.pret);
  const images = await page.evaluate(() => window.film.images);
  const de = partiel ? Number(a1) : 0;
  const a = partiel ? Math.min(images - 1, Number(a3)) : images - 1;
  const t0 = Date.now();
  let n = 0;
  for (let f = de; f <= a; f += pas) {
    await page.evaluate((i) => window.film.aller(i).then(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)))), f);
    await page.screenshot({ path: join(dossier, `f${String(essai ? n : f).padStart(5, '0')}.png`) });
    n++;
  }
  await b.close();
  console.log(`${n} images (film de ${images}) en ${((Date.now() - t0) / 1000).toFixed(0)} s → ${dossier}`);
})();
