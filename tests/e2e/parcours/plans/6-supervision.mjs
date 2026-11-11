import { CADRE } from './commun.mjs';
export default {
  nom: '6-supervision',
  url: '/demo/supervision?visite=0',
  cadre: CADRE,
  // La vue 3D survole la photo satellite : un cran de compression de plus que les écrans d'interface.
  crf: 28,
  async prepare({ attendre, cadrer }) {
    await attendre(6000);
    // L'en-tête et les chiffres de l'atelier, avec le bouton de la panne simulée.
    await cadrer({ x: 960, y: 200 });
  },
  async scene({ page, aller, cliquer, attendre, cadrer }) {
    await attendre(500);
    // Une panne simulée : la mesure dérive, EVAN alerte et dit où regarder.
    await cliquer(page.getByRole('button', { name: 'Simuler une panne' }).first(), 1000);
    await attendre(600);
    await cadrer({ x: 700, y: 300 }, 1300);
    await aller(760, 300, 1300);
    await attendre(2200);
    // Ce que l'alarme a suivi, étape par étape, dans le panneau de droite. La pièce est tirée au hasard et certaines
    // mesures dérivent lentement : la scène attend que l'alarme soit là, puis la laisse lire.
    await cadrer({ x: 1000, y: 560 }, 1300);
    await aller(1100, 600, 1300);
    await page.getByRole('article', { name: /^Alarme / }).first().waitFor({ timeout: 30_000 });
    await attendre(3600);
  },
};
