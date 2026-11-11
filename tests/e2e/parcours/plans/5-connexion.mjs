import { ouvrirConfig, CADRE } from './commun.mjs';
export default {
  nom: '5-connexion',
  url: '/demo/connexion?visite=0',
  cadre: CADRE,
  async prepare(outils) {
    await ouvrirConfig(outils);
    // Le panneau de la machine : sa liaison, ses quatre temps, ses variables.
    await outils.cadrer({ x: 1000, y: 520 });
    await outils.aller(1100, 440, 50);
  },
  async scene({ page, cliquer, aller, molette, attendre, centre }) {
    await attendre(600);
    // Le test de la liaison : EVAN, la passerelle de l'atelier, l'automate de la machine.
    await cliquer(page.getByRole('button', { name: /Temps 3 sur 4/ }), 1000);
    await attendre(2400);
    // Puis les valeurs de l'automate : le compteur de production, relié à la pièce qui compte les étiquettes.
    await cliquer(page.getByRole('button', { name: /Temps 4 sur 4/ }), 900);
    await attendre(600);
    await aller(1100, 640, 700);
    await molette(240, 900);
    await attendre(400);
    await cliquer(page.locator('[role="combobox"]').filter({ hasText: 'Pas reliée' }).nth(1), 900);
    await attendre(500);
    const option = page.getByRole('option', { name: 'Étiquettes rembobinées' });
    const liste = await centre(page.getByRole('listbox'));
    await aller(liste.x, liste.y, 600);
    const o = await centre(option);
    await molette(o.y - liste.y, 1100);
    await attendre(300);
    await cliquer(option, 700);
    await attendre(600);
    await aller(1160, 450, 900);
    await attendre(2000);
  },
};
