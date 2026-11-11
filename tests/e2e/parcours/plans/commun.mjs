/** Ouvre un écran de configuration de la démo (la fenêtre de confirmation passe) et attend que tout soit chargé. */
export async function ouvrirConfig({ page, attendre }) {
  await attendre(2500);
  const ouvrir = page.getByRole('button', { name: 'Ouvrir la configuration' });
  if (await ouvrir.count()) await ouvrir.click();
  await attendre(5500);
}

/**
 * Largeur du cadre filmé, en pixels de la page (1280 × 800) : la moitié de l'écran, au format 16:10. Dans le volet, la
 * vidéo fait environ 740 px de large sur grand écran : le texte de l'écran y garde sa taille, un peu plus même.
 */
export const CADRE = { w: 640 };
