/**
 * Chaîne complète, sur la pile Docker : le simulateur .NET publie en MQTT, l'API applique les règles et pousse l'alarme
 * par SignalR, l'écran la montre. La panne est provoquée par le bouton de l'interface, comme pendant une démonstration.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';

const SITE = 'site-tours';

interface Panne {
  machineId: string;
  organeId: string;
  code?: string;
}

const echapper = (texte: string) => texte.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Vrai si l'adresse testée sert l'API EVAN, et pas seulement le front. */
async function apiPresente(request: APIRequestContext): Promise<boolean> {
  try {
    const res = await request.get('/api/health');
    return res.ok() && ((await res.json()) as { service?: string }).service === 'evan-api';
  } catch {
    return false;
  }
}

/** Démo de l'usine remise à zéro : alarmes et journal, machines du simulateur. X-Evan, comme toute écriture du front. */
async function remettreAZero(request: APIRequestContext) {
  expect((await request.post(`/api/demo/${SITE}/reset`, { headers: { 'X-Evan': '1' } })).status()).toBe(202);
}

test.describe('chaîne complète', () => {
  test.beforeEach(async ({ request }) => {
    // Front servi seul : ce scénario n'a pas lieu d'être. En CI, la pile doit répondre, sinon le test échoue.
    test.skip(!process.env.CI && !(await apiPresente(request)), 'API EVAN injoignable à cette adresse : ce scénario demande la pile complète (docker compose).');
    await remettreAZero(request);
  });

  // La démo de l'API est partagée : la panne provoquée ne reste pas après le test.
  test.afterEach(async ({ request }, info) => {
    if (info.status !== 'skipped') await remettreAZero(request);
  });

  test('une panne provoquée à l’écran lève une alarme et met la machine en panne', async ({ page, request }) => {
    const usine = (await (await request.get(`/api/sites/${SITE}`)).json()) as { machines: { id: string; numero: string }[] };

    await page.goto('/demo?visite=0');
    await expect(page.getByRole('heading', { name: 'L’atelier en direct' })).toBeVisible();
    // Les valeurs viennent du serveur par SignalR, pas du simulateur du navigateur.
    await expect(page.getByRole('status', { name: 'Données : En direct' })).toBeVisible();

    // Le bandeau du haut donne l'état de chaque machine : la panne vise une machine qui produit.
    const atelier = page.getByRole('region', { name: 'L’atelier en ce moment' });
    const etats = atelier.getByRole('img', { name: / : En marche/ });
    await expect(etats).toBeVisible();
    const enMarche = [...((await etats.getAttribute('aria-label')) ?? '').matchAll(/(\S+) : En marche/g)].map((m) => m[1]);
    const cible = usine.machines.find((m) => enMarche.includes(m.numero));
    expect(cible, `une machine en marche parmi ${enMarche.join(', ')}`).toBeDefined();
    // Sans machine désignée, l'API tire au sort, et peut tomber sur PV01, réservée à la vraie passerelle et que le
    // simulateur ne joue pas : rien ne se passe alors. Le bouton reste celui de l'interface, seule la machine est fixée.
    await page.route(`**/api/demo/${SITE}/fault`, (route) => route.continue({ postData: JSON.stringify({ machineId: cible!.id }) }));

    const reponse = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith(`/api/demo/${SITE}/fault`));
    await page.getByRole('button', { name: 'Simuler une panne' }).click();
    const r = await reponse;
    expect(r.status()).toBe(200);
    const panne = (await r.json()) as Panne;
    expect(panne.machineId).toBe(cible!.id);
    const numero = echapper(cible!.numero);

    // L'alarme critique arrive : EVAN suit la panne jusqu'à la machine et ouvre ce qui s'y passe.
    await expect(page.getByRole('heading', { name: `Ce qui se passe dans ${cible!.numero}` })).toBeVisible();
    await expect(page.getByRole('article', { name: new RegExp(`^Alarme ${echapper(panne.code ?? '')}`) }).first()).toBeVisible();
    // Le bandeau du haut compte la machine en panne.
    await expect(atelier.getByRole('img', { name: new RegExp(`\\b${numero} : En panne`) })).toBeVisible();

    // Retour à toute l'usine : l'alarme est dans la liste, la machine dans le groupe « En panne ».
    await page.getByRole('button', { name: 'Toute l’usine' }).click();
    const alarmes = page.getByRole('list', { name: 'Alarmes à traiter, la plus urgente en haut' });
    await expect(alarmes.getByRole('button', { name: new RegExp(`^Panne : .*\\b${numero}\\b.*${echapper(panne.code ?? '')}`) })).toBeVisible();
    await page.getByRole('tab', { name: 'Machines' }).click();
    await expect(page.getByRole('region', { name: 'En panne' }).getByRole('button', { name: new RegExp(`\\b${numero}\\b`) })).toBeVisible();
  });
});
