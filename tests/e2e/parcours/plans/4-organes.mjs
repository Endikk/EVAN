import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '4-organes',
  url: '/demo/organes?visite=0',
  cadre: CADRE,
  prepare: ouvrirConfig,
  async scene({ page, aller, cliquer, molette, attendre }) {
    await attendre(600);
    // La liste des pièces de la presse, puis la dorure à froid montrée dans la vue 3D.
    await aller(1100, 600, 900);
    await molette(380, 900);
    await attendre(500);
    await cliquer(page.getByRole('button', { name: 'Voir Dorure à froid dans la vue 3D' }), 900);
    await attendre(800);
    await aller(560, 420, 1100);
    await attendre(3200);
  },
};
