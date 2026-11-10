/**
 * Travail qui peut attendre : lancé après la prochaine image (l'écran est peint), quand le navigateur est au repos,
 * et au plus tard `delaiMax` ms plus tard. Il ne dispute pas le processeur au premier affichage d'une page.
 * Renvoie de quoi l'annuler (à rendre par un useEffect).
 */
export function quandAuRepos(travail: () => void, delaiMax = 3000): () => void {
  let annule = false;
  let repos = 0;
  let minuterie = 0;
  const lancer = () => {
    if (!annule) travail();
  };
  const image = requestAnimationFrame(() => {
    if (typeof requestIdleCallback === 'function') repos = requestIdleCallback(lancer, { timeout: delaiMax });
    // Safari n'a pas requestIdleCallback : une seconde après l'affichage, au plus tard le délai maximal.
    else minuterie = window.setTimeout(lancer, Math.min(delaiMax, 1000));
  });
  return () => {
    annule = true;
    cancelAnimationFrame(image);
    if (repos) cancelIdleCallback(repos);
    window.clearTimeout(minuterie);
  };
}
