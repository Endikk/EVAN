import { ouvrirConfig, CADRE } from './commun.mjs';

/** Étiquette de surface du bâtiment relevé, posée sur la carte : le repère du cadre, où que la carte se soit calée. */
const etiquette = (page) => page.locator('.area-label').filter({ hasText: 'Bâtiment A' }).first();

export default {
  nom: '1-localiser',
  url: '/demo/localiser?visite=0',
  cadre: CADRE,
  // La photo satellite coûte cher à chaque panoramique : un cran de compression de plus que les écrans d'interface.
  crf: 28,
  async prepare(outils) {
    await ouvrirConfig(outils);
    const { x, y } = await outils.centre(etiquette(outils.page));
    await outils.cadrer({ x: x + 90, y: y - 20 });
    // Le curseur attend hors du cadre, dans le panneau : sur la carte, il ouvrirait la bulle d'un bâtiment.
    await outils.aller(1150, 250, 50);
  },
  async scene({ page, aller, cliquer, attendre, cadrer, centre }) {
    await attendre(500);
    // Le bâtiment relevé et sa surface, puis un voisin qu'un clic ajouterait à l'usine.
    const a = await centre(etiquette(page));
    await aller(a.x, a.y + 40, 1000);
    await attendre(700);
    await aller(a.x + 240, a.y + 20, 900);
    await attendre(1600);
    // La surface mesurée dans le panneau, puis le relief de la photo.
    await cadrer({ x: 1000, y: 560 }, 1200);
    await aller(1005, 512, 1200);
    await attendre(1000);
    await cliquer(page.getByRole('button', { name: 'Relief 3D' }), 900);
    await attendre(900);
    const b = await centre(etiquette(page));
    await cadrer({ x: b.x + 60, y: b.y - 40 }, 1400);
    // Le curseur ressort du cadre : posé sur la carte, la bulle d'un voisin masquerait l'étiquette.
    await aller(1150, 250, 1400);
    await attendre(2400);
  },
};
