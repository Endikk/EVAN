import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '4-organes',
  url: '/demo/organes?visite=0',
  cadre: CADRE,
  async prepare(outils) {
    await ouvrirConfig(outils);
    await outils.cadrer({ x: 1000, y: 470 });
  },
  async scene({ page, aller, cliquer, molette, attendre, cadrer, centre }) {
    await attendre(600);
    // La liste des pièces de la presse, puis la dorure à froid montrée dans la vue 3D.
    await aller(1100, 600, 900);
    await molette(380, 900);
    await attendre(800);
    await cliquer(page.getByRole('button', { name: 'Voir Dorure à froid dans la vue 3D' }), 900);
    await attendre(300);
    await cadrer({ x: 520, y: 430 }, 1300);
    await aller(560, 420, 1300);
    await attendre(1200);
    // Retour au panneau : ce que la pièce mesure, et si c'est dans la plage.
    const mesure = await centre(page.getByText('Tension du film').first());
    await cadrer({ x: 1000, y: mesure.y + 40 }, 1300);
    await aller(mesure.x + 60, mesure.y, 1300);
    await attendre(2600);
  },
};
