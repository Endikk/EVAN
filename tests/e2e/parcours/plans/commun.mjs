/** Ouvre un écran de configuration de la démo (la fenêtre de confirmation passe) et attend que tout soit chargé. */
export async function ouvrirConfig({ page, attendre }) {
  await attendre(2500);
  const ouvrir = page.getByRole('button', { name: 'Ouvrir la configuration' });
  if (await ouvrir.count()) await ouvrir.click();
  await attendre(5500);
}
export const CADRE = { x: 80, y: 0, w: 1200, h: 750 };
