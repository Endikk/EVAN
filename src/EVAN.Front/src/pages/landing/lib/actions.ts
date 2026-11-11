/**
 * Les deux actions de l'accueil, reprises au pied du volet « Comment ça marche » : la démo, ou son usine.
 */
import type { EtatSession } from '@/store/session';

/**
 * « Voir la démo » : la visite guidée démarre au chapitre de la supervision (le sixième), où une panne arrive. Le
 * visiteur voit tout de suite ce que la page promet, au lieu de commencer par la carte.
 */
export const ADRESSE_DEMO = '/demo?visite=6';

export interface ActionUsine {
  to: string;
  libelle: string;
  /** Ce que le bouton ne dit pas et qu'il faut savoir avant de cliquer. */
  note?: string;
}

/**
 * Le second bouton dépend de qui regarde. Un compte connecté retrouve les usines de son organisation, sur le serveur
 * (`?nouveau=1` en ajouterait une vide). Sans compte, l'assistant travaille dans le navigateur : il reprend l'usine
 * commencée, ou en démarre une. Quand un serveur EVAN existe mais que personne n'est connecté, l'usine ne part pas
 * vers l'organisation : la note le dit avant qu'on la remplisse.
 */
export function actionUsine(session: EtatSession, enregistree: boolean): ActionUsine {
  if (session === 'connecte') return { to: '/assistant', libelle: 'Ouvrir mes usines' };
  const action: ActionUsine = enregistree
    ? { to: '/assistant', libelle: 'Reprendre mon usine' }
    : { to: '/assistant?nouveau=1', libelle: 'Commencer avec mon usine' };
  return session === 'anonyme' ? { ...action, note: 'Sans connexion, l’usine reste dans ce navigateur.' } : action;
}
