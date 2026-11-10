import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '2-plan',
  url: '/demo/plan?visite=0',
  cadre: CADRE,
  prepare: ouvrirConfig,
  async scene({ page, aller, glisser, cliquer, attendre, centre }) {
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
    // Puis le plan 2D, coté.
    await cliquer(page.getByRole('button', { name: 'Plan 2D' }), 900);
    await aller(520, 380, 1000);
    await attendre(2600);
  },
};
