import { CADRE } from './commun.mjs';
export default {
  nom: '6-supervision',
  url: '/demo/supervision?visite=0',
  cadre: CADRE,
  async prepare({ attendre }) {
    await attendre(6000);
  },
  async scene({ page, aller, cliquer, attendre }) {
    await attendre(500);
    // Une panne simulée : la mesure dérive, EVAN alerte, la caméra va sur la pièce.
    await cliquer(page.getByRole('button', { name: 'Simuler une panne' }).first(), 1000);
    await attendre(500);
    await aller(1080, 330, 900);
    await attendre(10600);
  },
};
