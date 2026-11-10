/**
 * Démo du navigateur seul : simulateur et moteur de règles embarqués (src/EVAN.Front/src/sim), sans back. Toute requête
 * vers l'API ou le hub échoue, comme sur un hébergement statique.
 */
import { expect, test } from '@playwright/test';

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('la démo du navigateur s’affiche et tourne sans API', async ({ page }) => {
  await page.route(/\/(api|hubs)\//, (route) => route.abort());

  await page.goto('/demo?source=local&visite=0');
  await expect(page.getByRole('heading', { name: 'L’atelier en direct' })).toBeVisible();
  const flux = page.getByRole('status', { name: 'Données : Données simulées' });
  await expect(flux).toBeVisible();
  // Le flux avance : passé le délai au-delà duquel l'écran le dirait figé (5 s), il est toujours frais.
  await page.waitForTimeout(6_000);
  await expect(flux).toBeVisible();

  // Le moteur de règles du navigateur lève l'alarme et EVAN suit la panne jusqu'à la machine.
  await page.getByRole('button', { name: 'Simuler une panne' }).click();
  const suivi = page.getByRole('heading', { name: /^Ce qui se passe dans / });
  await expect(suivi).toBeVisible();
  const numero = ((await suivi.textContent()) ?? '').replace('Ce qui se passe dans', '').trim();
  await expect(page.getByRole('article', { name: /^Alarme / }).first()).toBeVisible();
  await expect(page.getByRole('region', { name: 'L’atelier en ce moment' }).getByRole('img', { name: new RegExp(`\\b${echapper(numero)} : En panne`) })).toBeVisible();
});
