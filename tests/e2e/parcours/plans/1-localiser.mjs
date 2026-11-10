import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '1-localiser',
  url: '/demo/localiser?visite=0',
  cadre: CADRE,
  prepare: ouvrirConfig,
  async scene({ page, aller, cliquer, attendre }) {
    await attendre(600);
    // Le regard va du bâtiment relevé à sa surface, puis le relief se lève.
    await aller(460, 330, 900);
    await attendre(500);
    await aller(1010, 400, 900);
    await attendre(700);
    await cliquer(page.getByRole('button', { name: 'Relief 3D' }), 900);
    await attendre(600);
    await aller(560, 420, 1100);
    await attendre(2600);
  },
};
