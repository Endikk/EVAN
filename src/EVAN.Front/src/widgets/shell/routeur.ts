/**
 * L'adresse suit l'écran ouvert. La navigation (goToStep, visite guidée, vue d'ensemble…) change d'abord l'état de
 * l'interface, puis `synchroniserUrl` reporte l'écran dans l'adresse : chaque écran a la sienne, le bouton retour et les
 * favoris fonctionnent. Le routeur est branché ici par app/router.tsx, pour que ce module n'importe pas l'application.
 */
import { useUi } from '@/store/ui';
import { chemin, lireChemin, type Ecran } from './ecrans';

interface Routeur {
  naviguer(to: string, opts: { replace: boolean; state: typeof MARQUE }): void;
  lieu(): { pathname: string; search: string };
}

/** Marque des adresses écrites ici, pour les distinguer d'un lien suivi ou d'un retour dans l'historique. */
const MARQUE = { evanEcran: true } as const;

export function estAdresseInterne(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { evanEcran?: unknown }).evanEcran === true;
}

let routeur: Routeur | null = null;

export function brancherRouteur(r: Routeur) {
  routeur = r;
}

/** Écran affiché d'après l'état de l'interface. */
export function ecranCourant(): Ecran {
  const ui = useUi.getState();
  return ui.vueOrganisation ? 'organisation' : ui.step;
}

/** Une seule écriture par tour de boucle : plusieurs changements d'état d'affilée ne laissent qu'une entrée d'historique. */
const attente = { planifiee: false, remplacer: false, retirer: new Set<string>() };

/**
 * Reporte l'écran courant dans l'adresse. `replace` remplace l'entrée d'historique au lieu d'en ajouter une ;
 * `retirer` enlève des paramètres déjà lus (?nouveau=1, ancien ?ecran=…).
 */
export function synchroniserUrl(opts: { replace?: boolean; retirer?: readonly string[] } = {}) {
  if (opts.replace) attente.remplacer = true;
  opts.retirer?.forEach((p) => attente.retirer.add(p));
  if (attente.planifiee) return;
  attente.planifiee = true;
  queueMicrotask(() => {
    const remplacer = attente.remplacer;
    const retirer = [...attente.retirer];
    attente.planifiee = false;
    attente.remplacer = false;
    attente.retirer.clear();
    appliquer(remplacer, retirer);
  });
}

function appliquer(remplacer: boolean, retirer: readonly string[]) {
  if (!routeur) return;
  const lieu = routeur.lieu();
  const lu = lireChemin(lieu.pathname);
  // Hors de l'espace de travail (accueil, page introuvable) : rien à reporter.
  if (!lu) return;
  const params = new URLSearchParams(lieu.search);
  retirer.forEach((p) => params.delete(p));
  const query = params.toString();
  const search = query ? `?${query}` : '';
  const cible = chemin(lu.mode, ecranCourant()) + search;
  if (cible !== lieu.pathname + lieu.search) routeur.naviguer(cible, { replace: remplacer, state: MARQUE });
}
