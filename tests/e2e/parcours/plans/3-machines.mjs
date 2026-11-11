import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '3-machines',
  url: '/demo/machines?visite=0',
  cadre: CADRE,
  // Photo satellite en fond : un cran de compression de plus que les écrans d'interface.
  crf: 28,
  async prepare(outils) {
    await ouvrirConfig(outils);
    // La bibliothèque et la zone de stock où la presse sera posée, dans le même cadre.
    const carte = await outils.centre(outils.page.getByRole('button', { name: /^Choisir : Presse flexo/ }));
    await outils.cadrer({ x: (carte.x + 590) / 2, y: carte.y });
  },
  async scene({ page, aller, glisser, cliquer, attendre, centre, cadrer }) {
    await attendre(600);
    // Une presse prise dans la bibliothèque et posée dans la zone de stock.
    const carte = await centre(page.getByRole('button', { name: /^Choisir : Presse flexo/ }));
    await glisser({ x: carte.x - 30, y: carte.y }, { x: 590, y: 498 }, 1500);
    await attendre(900);
    // Tournée d'un quart de tour pour suivre l'allée.
    const tourner = page.getByRole('button', { name: 'Tourner de 15 degrés à droite' });
    await cadrer(tourner, 900);
    await cliquer(tourner, 900);
    await attendre(350);
    await cliquer(tourner, 300);
    await attendre(500);
    await cadrer({ x: 600, y: 470 }, 1100);
    await aller(630, 470, 1100);
    await attendre(2000);
  },
};
