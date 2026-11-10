/**
 * Bout en bout d'EVAN dans un vrai navigateur. EVAN_URL donne l'adresse (défaut : la pile Docker locale,
 * http://localhost:8088). Lancement et réglages : docs/ARCHITECTURE.md § 9.
 */
import { defineConfig, devices } from '@playwright/test';

const CI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  // Les scénarios partagent l'état de démo de l'API (pannes, alarmes, journal) : un seul à la fois.
  fullyParallel: false,
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // Sur un runner GitHub, la scène 3D est rendue sans carte graphique (SwiftShader) et occupe le fil principal : une
  // action y prend de quelques secondes à près de deux minutes. Le scénario complet passe en un peu plus de 4 min.
  timeout: CI ? 420_000 : 90_000,
  // Une panne de démo met quelques secondes à franchir son seuil : l'alarme n'apparaît pas tout de suite. En CI, l'écran
  // ralenti par le rendu sans GPU l'a montrée juste après 30 s : 60 s d'attente par vérification.
  expect: { timeout: CI ? 60_000 : 30_000 },
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: process.env.EVAN_URL ?? 'http://localhost:8088',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    // Ni rotation ni vol de caméra : l'écran se stabilise plus vite et la caméra va droit à l'organe.
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Chaque test ouvre un contexte neuf (cache vide) : un ancien fichier « immutable » ne peut pas fausser l'écran.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
