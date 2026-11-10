import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '3-machines',
  url: '/demo/machines?visite=0',
  cadre: CADRE,
  prepare: ouvrirConfig,
  async scene({ page, aller, glisser, cliquer, attendre, centre }) {
    await attendre(600);
    // Une presse prise dans la bibliothèque et posée dans la zone de stock.
    const carte = await centre(page.getByText('Presse flexo', { exact: true }).first());
    await glisser({ x: carte.x - 30, y: carte.y }, { x: 590, y: 498 }, 1500);
    await attendre(900);
    // Tournée d'un quart de tour pour suivre l'allée.
    await cliquer(page.getByRole('button', { name: 'Tourner de 15 degrés à droite' }), 900);
    await attendre(350);
    await cliquer(page.getByRole('button', { name: 'Tourner de 15 degrés à droite' }), 300);
    await attendre(500);
    await aller(630, 470, 900);
    await attendre(2000);
  },
};
