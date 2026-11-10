import { defineConfig } from 'vitest/config';
import { alias } from './vite.config.ts';

export default defineConfig({
  resolve: { alias },
  // Fuseau fixé : l'historique simulé découpe les journées à minuit, heure locale, comme le back (cas de test communs).
  test: { environment: 'node', env: { TZ: 'Europe/Paris' } },
});
