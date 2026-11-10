/**
 * L'écran ouvert et l'adresse restent d'accord. Dans l'application, l'état change d'abord et l'adresse suit
 * (synchroniserUrl). Avec le bouton retour ou avance, l'adresse change d'abord et l'écran suit. Revenir par l'historique
 * d'un écran d'exploitation à un écran de paramétrage passe par la fenêtre d'accès, comme le bouton « Configurer ».
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { NavigationType, useBlocker, useLocation, useNavigationType, type BlockerFunction } from 'react-router';
import { useUi } from '@/store/ui';
import { stopTour } from '@/widgets/tour/tour';
import type { ProjectMode } from '@/store/project';
import { estConfiguration, lireChemin } from '@/widgets/shell/ecrans';
import { ecranCourant, estAdresseInterne, synchroniserUrl } from '@/widgets/shell/routeur';
import { ouvrirEcran } from '@/widgets/shell/navigation';
import { PARAMS_LUS } from '../lib/chargement';

export function useEcranDansUrl(mode: ProjectMode, ready: boolean) {
  const location = useLocation();
  const action = useNavigationType();
  // Dernière adresse déjà rapprochée de l'écran : celle du chargement, puis chacune des suivantes.
  const vue = useRef<string | null>(null);
  // Numéro du dernier écran ouvert depuis l'adresse : un retour plus récent l'emporte sur une ouverture encore en cours.
  const ouverture = useRef(0);

  // Une fois par chargement : l'adresse dit l'écran ouvert, puis l'abonnement lui fait suivre chaque changement d'écran.
  // Effet de mise en page : en passant de la démo à son usine, l'abonnement de l'espace quitté est retiré avant que le
  // nouveau ne charge son projet, qui sinon serait reporté dans l'adresse comme une navigation.
  useLayoutEffect(() => {
    if (!ready) return;
    vue.current = location.key;
    synchroniserUrl({ replace: true, retirer: PARAMS_LUS });
    // La visite guidée enchaîne les écrans sans empiler l'historique : le retour mène là où l'on était avant elle.
    return useUi.subscribe((s, prev) => {
      if (s.step !== prev.step || s.vueOrganisation !== prev.vueOrganisation) synchroniserUrl({ replace: s.tour.playing });
    });
  }, [ready]);

  // Retour, avance, ou lien vers un autre écran : l'écran suit l'adresse. Un écran refusé (pas encore de bâtiment)
  // remet l'adresse sur l'écran resté ouvert. Les adresses écrites par synchroniserUrl sont marquées : l'écran y est
  // déjà, et l'état a pu changer encore depuis (visite guidée qui enchaîne les écrans).
  useEffect(() => {
    if (!ready || vue.current === location.key) return;
    vue.current = location.key;
    if (action !== NavigationType.Pop && estAdresseInterne(location.state)) return;
    const lu = lireChemin(location.pathname);
    if (!lu || lu.mode !== mode) return;
    // Les paramètres lus au chargement (?nouveau=1) ne doivent pas revenir avec une entrée plus ancienne de l'historique.
    if (lu.ecran === undefined || lu.ecran === ecranCourant()) {
      synchroniserUrl({ replace: true, retirer: PARAMS_LUS });
      return;
    }
    // Revenir en arrière, c'est reprendre la main : la visite guidée s'arrête.
    stopTour();
    const n = ++ouverture.current;
    void ouvrirEcran(lu.ecran).then(() => {
      if (n === ouverture.current) synchroniserUrl({ replace: true, retirer: PARAMS_LUS });
    });
  }, [ready, mode, action, location.key, location.pathname, location.state]);

  const garde = useCallback<BlockerFunction>(
    ({ nextLocation }) => {
      const lu = lireChemin(nextLocation.pathname);
      // Autre espace (de la démo à son usine) ou hors de l'espace de travail : rien à garder ici.
      if (!lu || lu.mode !== mode || lu.ecran === undefined) return false;
      // L'application a déjà ouvert cet écran (accès accordé, visite guidée) : l'adresse ne fait que suivre.
      if (lu.ecran === ecranCourant()) return false;
      // L'étape sous la vue d'ensemble compte : ouverte depuis le paramétrage, elle y ramène sans fenêtre d'accès.
      return estConfiguration(lu.ecran) && !estConfiguration(useUi.getState().step);
    },
    [mode],
  );
  const blocker = useBlocker(garde);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    const suivant = lireChemin(blocker.location.pathname)?.ecran;
    blocker.reset();
    stopTour();
    if (suivant !== undefined && estConfiguration(suivant)) useUi.getState().setAccessRequest(suivant);
  }, [blocker]);
}
