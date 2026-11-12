/**
 * Captures plein écran (1280 × 800, densité 2, thème nuit) des écrans réels de la démo, pour les cartes du film.
 * Le serveur de développement du front doit tourner : EVAN_URL (défaut http://localhost:5199).
 */
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const sortie = join(__dirname, 'travail/ecrans');
mkdirSync(sortie, { recursive: true });
const U = `${process.env.EVAN_URL ?? 'http://localhost:5199'}/demo/`;
(async () => {
  const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, locale: 'fr-FR' });
  await ctx.addInitScript(() => localStorage.setItem('evan.theme', 'dark'));
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('page :', e.message));
  const photo = (n) => p.screenshot({ path: join(sortie, `${n}.jpg`), type: 'jpeg', quality: 93 }).then(() => console.log(n));
  for (const e of ['localiser', 'plan', 'machines', 'organes', 'connexion']) {
    await p.goto(`${U}${e}?visite=0`, { waitUntil: 'load' });
    await p.waitForTimeout(2500);
    const ouvrir = p.getByRole('button', { name: 'Ouvrir la configuration' });
    if (await ouvrir.count()) await ouvrir.click();
    // La photo satellite met du temps à arriver en densité 2.
    await p.waitForTimeout(e === 'localiser' ? 12000 : 9000);
    await photo(e);
  }
  for (const e of ['historique', 'maintenance', 'energie', 'organisation']) {
    await p.goto(`${U}${e}?visite=0`, { waitUntil: 'load' });
    await p.waitForTimeout(7000);
    await photo(e);
  }
  await b.close();
})();
