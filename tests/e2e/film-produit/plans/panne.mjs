/**
 * Plan du film produit, tourné par parcours/tournage.mjs : la supervision en plein cadre, sans curseur. Une casse
 * d'échenillage sur la presse R01 (organe 7), puis la plongée de la caméra jusqu'à l'organe.
 */
export default {
  nom: 'panne',
  url: '/demo/supervision?visite=0',
  cadre: { w: 1280 },
  crf: 18,
  async prepare({ page, attendre, aller }) {
    // La photo satellite doit être arrivée avant la première image.
    await attendre(14000);
    await page.addStyleTag({ content: '#__curseur{display:none!important}' });
    await aller(640, 60, 50);
  },
  async scene({ page, attendre }) {
    await attendre(1500);
    // « Simuler une panne » tire une machine au hasard : le film vise la presse du scénario de la démo.
    await page.evaluate(async () => {
      const nav = await import('/src/widgets/shell/navigation.ts');
      void nav.simulateFault('m-r01', 7);
    });
    await page.getByRole('article', { name: /^Alarme / }).first().waitFor({ timeout: 30_000 });
    await attendre(9000);
  },
};
