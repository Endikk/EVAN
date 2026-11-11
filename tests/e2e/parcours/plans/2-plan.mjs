import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '2-plan',
  url: '/demo/plan?visite=0',
  cadre: CADRE,
  // Photo satellite en fond : un cran de compression de plus que les écrans d'interface.
  crf: 28,
  async prepare(outils) {
    await ouvrirConfig(outils);
    // Le curseur de hauteur et le mur du bâtiment qui monte, dans le même cadre.
    const { x, y } = await outils.centre(outils.page.getByRole('slider', { name: /Bâtiment A/ }));
    await outils.cadrer({ x: x - 140, y: y - 80 });
  },
  async scene({ page, aller, glisser, cliquer, attendre, centre, cadrer }) {
    await attendre(500);
    // La hauteur du bâtiment, au curseur : les murs montent dans la vue 3D.
    const curseur = page.getByRole('slider', { name: /Bâtiment A/ });
    const { b } = await centre(curseur);
    const x = (v) => b.x + 8 + ((v - 3) / 22) * (b.width - 16);
    const y = b.y + b.height / 2;
    await glisser({ x: x(9.2), y }, { x: x(22), y }, 1400);
    await attendre(500);
    await glisser({ x: x(22), y }, { x: x(12), y }, 1000);
    await attendre(700);
    // Puis le plan 2D, coté, avec ses zones.
    await cliquer(page.getByRole('button', { name: 'Plan 2D' }), 900);
    await attendre(300);
    await cadrer({ x: 490, y: 430 }, 1400);
    await aller(520, 400, 1400);
    await attendre(2600);
  },
};
