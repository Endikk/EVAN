import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '5-connexion',
  url: '/demo/connexion?visite=0',
  cadre: CADRE,
  prepare: ouvrirConfig,
  async scene({ page, cliquer, aller, attendre }) {
    await attendre(600);
    // Le test de la liaison, puis les valeurs reliées aux pièces de la machine.
    await cliquer(page.getByRole('button', { name: /Temps 3 sur 4/ }), 1000);
    await attendre(2600);
    await cliquer(page.getByRole('button', { name: /Temps 4 sur 4/ }), 900);
    await attendre(900);
    await cliquer(page.getByRole('button', { name: 'Associer automatiquement' }), 900);
    await attendre(600);
    await aller(1120, 600, 900);
    await attendre(2200);
  },
};
