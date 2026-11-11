/**
 * Espace de travail commun à /demo (organisation d'exemple) et /assistant (l'organisation de l'utilisateur),
 * sur l'usine active. C'est la mise en page de tous les écrans : barre du haut, carte satellite, scène 3D, fenêtres.
 * Chaque écran est une page (/demo/plan → pages/plan) qui remplit les zones de cette mise en page.
 * Une seule scène : carte satellite à l'étape 1, puis plan 3D (ou 2D) jusqu'à la supervision. Elle reste montée d'un
 * écran à l'autre, puisque seule la page change.
 */
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router';
import { useProject, type ProjectMode } from '@/store/project';
import type { EtapeConfig } from '@/store/avancement';
import { useUi, espaceOf, enPleinePage } from '@/store/ui';
import { useLive } from '@/store/live';
import { useRealtime } from '@/realtime/source';
import { setTabPage, setTabStatus } from '@/ui/brand';
import { ErrorBoundary, Indisponible } from '@/ui/ErrorBoundary';
import { quandAuRepos } from '@/ui/repos';
import { TopBar } from '@/widgets/shell/TopBar';
import { usePlantStatus } from '@/widgets/shell/Brand';
import { Sidebar } from '@/widgets/shell/Sidebar';
import { useCoquille } from '@/widgets/shell/coquille';
import '@/widgets/shell/coquille.css';
import { Toasts } from '@/widgets/shell/Toasts';
import { CaptionBar, StageHud } from '@/widgets/shell/StageHud';
import { focusAlarm } from '@/widgets/shell/navigation';
import { AccessDialog } from '@/widgets/shell/AccessDialog';
import { lireChemin, titreEcran, type Ecran } from '@/widgets/shell/ecrans';
import { ZonesProvider, useZonesHote } from '@/widgets/shell/zones';
import { OrganisationDialog } from '@/widgets/usines/OrganisationDialog';
import { AlarmCard } from '@/widgets/pannes/AlarmCard';
import { ReplayDialog } from '@/widgets/pannes/ReplayGate';
import { InterventionDialog } from '@/widgets/intervention/InterventionDialog';
import { AssistantPanel } from '@/widgets/assistant/AssistantPanel';
import { useSceneUi } from '@/widgets/scene/sceneState';
import { pauseTour, startTour } from '@/widgets/tour/tour';
import { ErreurApi } from '@/api/http';
import { chargerDepuisServeur, chargerEspace } from './lib/chargement';
import { ChargementServeur } from './features/ChargementServeur';
import { PiedConfiguration } from './features/PiedConfiguration';
import { useAvantDeQuitter } from './hooks/useAvantDeQuitter';
import { useEcranDansUrl } from './hooks/useEcranDansUrl';
import { useRaccourcis } from './hooks/useRaccourcis';
import { poserMachineChoisie, useDepotMachine } from './hooks/useDepotMachine';

/**
 * La visite guidée rend la main dès qu'on touche à l'interface : un clic ou une touche d'action (Entrée, Espace) sur
 * la barre latérale, la barre du haut, les onglets d'un écran ou la scène la met en pause. Seules ses propres commandes
 * (sa légende, son entrée dans la barre latérale, marquées data-visite) la laissent jouer : elles la pilotent elles-mêmes.
 * Sans cela, elle reprenait l'écran qu'on venait d'ouvrir.
 */
function reprendLaMain(e: ReactPointerEvent | ReactKeyboardEvent) {
  if (!e.isTrusted || !useUi.getState().tour.playing) return;
  const cible = e.target as HTMLElement;
  if (cible.closest('.caption, [data-visite]')) return;
  if ('key' in e && e.key !== 'Enter' && e.key !== ' ') return;
  pauseTour();
}

/**
 * Après un changement d'écran, le focus passe au titre de l'écran (tabIndex -1) : le clavier et le lecteur d'écran
 * repartent du haut du nouvel écran, au lieu du bouton cliqué (parfois disparu) ou du corps de la page. Sauf si le
 * focus est dans la légende de la visite ou dans une fenêtre : on les utilise encore.
 */
function focusTitreEcran() {
  const actif = document.activeElement;
  if (actif instanceof HTMLElement && actif.closest('.caption, [role="dialog"], .assistant')) return;
  document.querySelector<HTMLElement>('.ecran-titre')?.focus({ preventScroll: true });
}

// Chargés à la demande : moteur 3D et carte sortent du premier téléchargement.
const SceneCanvas = lazy(() => import('@/widgets/scene/SceneCanvas').then((m) => ({ default: m.SceneCanvas })));
const SiteMap = lazy(() => import('@/widgets/carte/SiteMap').then((m) => ({ default: m.SiteMap })));

export function Workspace({ mode }: { mode: ProjectMode }) {
  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const [ready, setReady] = useState(false);
  const [visite, setVisite] = useState<number | null>(null);
  // Assistant : l'organisation d'un compte connecté se relit d'abord sur le serveur (essai : relancé par « Réessayer »).
  const [serveur, setServeur] = useState<{ erreur?: { message: string; statut: number } } | null>(null);
  const [essai, setEssai] = useState(0);

  // Chargement du projet selon le mode, avant le premier rendu de la scène. Le routeur crée une instance par mode :
  // ensuite, changer d'écran change l'adresse, pas le projet. Sans compte (ou sans serveur), l'assistant garde son
  // usine dans le navigateur, comme avant.
  useLayoutEffect(() => {
    const ouvrir = (depuisServeur: boolean) => {
      setVisite(chargerEspace(mode, lireChemin(pathname)?.ecran, params, depuisServeur));
      setReady(true);
    };
    if (mode === 'demo') {
      ouvrir(false);
      return;
    }
    let actif = true;
    setServeur({});
    chargerDepuisServeur().then(
      (depuisServeur) => {
        if (!actif) return;
        setServeur(null);
        ouvrir(depuisServeur);
      },
      (err: unknown) => {
        if (!actif) return;
        const e = err instanceof ErreurApi ? err : new ErreurApi(0, 'Le serveur EVAN ne répond pas.');
        setServeur({ erreur: { message: e.message, statut: e.statut } });
      },
    );
    return () => {
      actif = false;
    };
  }, [mode, essai]);

  useAvantDeQuitter();

  useEcranDansUrl(mode, ready);
  // Téléphone : changer d'écran referme le menu latéral.
  useEffect(() => useCoquille.getState().setMenuOuvert(false), [pathname]);
  useRaccourcis();

  // Un flux temps réel par usine : changer d'usine arrête le flux de la précédente et rejoint celui de la nouvelle.
  const activeId = useProject((s) => s.activeId);
  useRealtime(ready ? activeId : undefined);

  const step = useUi((s) => s.step);
  const focus = useUi((s) => s.focus);
  const replie = useCoquille((s) => s.replie);
  const groundReady = useSceneUi((s) => s.groundReady);
  const alarms = useLive((s) => s.alarms);
  const hasBuildings = useProject((s) => s.batiments.length > 0);
  const [mapGone, setMapGone] = useState(false);
  const depot = useDepotMachine(step);
  const { noeuds, refs } = useZonesHote();

  // Écran affiché : celui de l'adresse, qui choisit aussi la page. Sur /demo seul, le temps d'écrire l'adresse,
  // celui de l'état.
  const ecranEtat = useUi((s): Ecran => (s.vueOrganisation ? 'organisation' : s.step));
  const ecran = lireChemin(pathname)?.ecran ?? ecranEtat;
  const espace = espaceOf(ecran === 'organisation' ? step : ecran);
  const pleinePage = ecran === 'organisation' || enPleinePage(ecran);

  // Focus sur le titre à chaque changement d'écran, pas au premier affichage (le navigateur garde son ordre naturel).
  const ecranPrecedent = useRef<typeof ecran | null>(null);
  useEffect(() => {
    if (!ready) return;
    const avant = ecranPrecedent.current;
    ecranPrecedent.current = ecran;
    if (avant === null || avant === ecran) return;
    const raf = requestAnimationFrame(focusTitreEcran);
    return () => cancelAnimationFrame(raf);
  }, [ecran, ready]);

  // Onglet du navigateur : l'écran ouvert dans le titre, le point de l'icône à la couleur de l'atelier, le code de
  // la panne en tête.
  const plant = usePlantStatus();
  const panneCode = alarms.find((a) => a.statut !== 'resolue' && a.gravite === 'critique')?.code;
  useEffect(() => setTabStatus(plant, panneCode ? `Panne ${panneCode}` : undefined), [plant, panneCode]);
  useEffect(() => setTabPage(titreEcran(ecran)), [ecran]);
  useEffect(
    () => () => {
      setTabStatus('ok');
      setTabPage(undefined);
    },
    [],
  );

  // Démarrage automatique de la visite guidée sur /demo (sauf ?visite=0 ou lien vers un écran).
  useEffect(() => {
    if (!ready || visite === null) return;
    const t = window.setTimeout(() => void startTour(visite), 1200);
    return () => window.clearTimeout(t);
  }, [ready, visite]);

  // La carte reste visible tant que le sol satellite 3D n'est pas prêt (fondu sans trou noir).
  useEffect(() => {
    if (step === 1) {
      setMapGone(false);
      return;
    }
    if (groundReady) {
      const t = window.setTimeout(() => setMapGone(true), 150);
      return () => window.clearTimeout(t);
    }
    const t = window.setTimeout(() => setMapGone(true), 3500);
    return () => window.clearTimeout(t);
  }, [step, groundReady]);

  // Organe ciblé : en supervision, fiche d'alarme accrochée à l'organe dans la 3D.
  const organFocus = useMemo(() => {
    if (focus.kind !== 'organe') return undefined;
    const alarm = alarms.find((a) => a.organeId === focus.organeId && a.statut !== 'resolue');
    return { machineId: focus.machineId, organeId: focus.organeId, kind: alarm && step === 6 ? ('defaut' as const) : ('selection' as const), alarm };
  }, [focus, alarms, step]);

  // Sous un écran en pleine page ouvert directement (historique, énergie…), ni la carte ni la 3D ne se voient : elles
  // se montent une fois la page affichée et le navigateur au repos, au lieu de lui disputer le processeur (MapLibre et
  // Three.js, puis les modèles). Quitter la pleine page avant les monte aussitôt.
  const [arrierePlan, setArrierePlan] = useState(!pleinePage);
  if (!pleinePage && !arrierePlan) setArrierePlan(true);
  useEffect(() => {
    if (!arrierePlan) return quandAuRepos(() => setArrierePlan(true));
  }, [arrierePlan]);

  // Une fois montée, la scène le reste (sous la carte ou l'historique), en pause : démonter un Canvas
  // plein d'étiquettes HTML casse leurs portails, et on garde caméra et modèles chargés.
  const [sceneMounted, setSceneMounted] = useState(false);
  useEffect(() => {
    if (arrierePlan && step >= 2 && hasBuildings) setSceneMounted(true);
  }, [arrierePlan, step, hasBuildings]);
  const sceneVisible = sceneMounted && hasBuildings;
  const carteVisible = step === 1 || !mapGone;
  const sceneDevant = mapGone && step !== 1;

  // Le temps de lire l'organisation du compte, rien d'autre ne s'affiche : ni la démo, ni une copie du navigateur.
  if (serveur) return <ChargementServeur erreur={serveur.erreur} reessayer={() => setEssai((n) => n + 1)} />;

  return (
    <ZonesProvider value={noeuds}>
      <div
        className={`app ${espace} ${pleinePage ? 'page' : ''} ${replie ? 'replie' : ''}`}
        onPointerDownCapture={reprendLaMain}
        onKeyDownCapture={reprendLaMain}
      >
        <Sidebar />
        <TopBar />
        <div className="zone-hote" ref={refs.bandeau} />
        <main className="stage">
          {/* Étape 1 : carte satellite (reste montée pour la transition retour). Masquée, elle sort de l'ordre de
              tabulation et de l'arbre d'accessibilité (inert) : ses commandes ne se tabulent plus sous les autres écrans. */}
          <div className={`stage-layer ${carteVisible ? '' : 'hidden'}`} style={{ zIndex: step === 1 ? 2 : 1 }} inert={!carteVisible}>
            <ErrorBoundary
              label="Carte"
              resetKey={activeId}
              fallback={(retry) => <Indisponible titre="Carte indisponible" texte="La carte n’a pas pu s’afficher (WebGL ou réseau). Le reste de l’application fonctionne." retry={retry} />}
            >
              {arrierePlan && (
                <Suspense fallback={null}>
                  <SiteMap visible={step === 1} />
                </Suspense>
              )}
            </ErrorBoundary>
            <div className="zone-hote" ref={refs.carte} />
          </div>

          {sceneVisible && (
            <div className={`stage-layer ${sceneDevant ? '' : 'hidden'}`} style={{ zIndex: 1 }} inert={!sceneDevant || pleinePage} {...depot}>
              <ErrorBoundary
                label="Vue 3D"
                resetKey={activeId}
                fallback={(retry) => (
                  <Indisponible
                    titre="Vue 3D indisponible"
                    texte="Ce navigateur ou cet appareil n’a pas pu afficher la scène (WebGL). Les panneaux de supervision et les alarmes restent à jour."
                    retry={retry}
                  />
                )}
              >
                <Suspense fallback={null}>
                  <SceneCanvas
                    step={step}
                    paused={pleinePage || step === 1}
                    organFocus={organFocus}
                    organCard={organFocus?.alarm && step === 6 ? <AlarmCard a={organFocus.alarm} /> : undefined}
                    onMachineSelect={(id) => {
                      const ui = useUi.getState();
                      ui.selectMachine(id);
                      if (ui.step === 4) ui.setFocus({ kind: 'machine', machineId: id });
                      if (ui.step === 6) {
                        const crit = useLive.getState().alarms.find((a) => a.machineId === id && a.gravite === 'critique' && a.statut !== 'resolue');
                        if (crit) focusAlarm(crit.id);
                        else ui.setFocus({ kind: 'machine', machineId: id });
                      }
                    }}
                    onFloorClick={poserMachineChoisie}
                  />
                </Suspense>
              </ErrorBoundary>
            </div>
          )}

          {pleinePage && <div className="stage-layer" style={{ zIndex: 4 }} ref={refs['pleine-page']} />}

          {!pleinePage && <StageHud />}
        </main>
        {!pleinePage && (
          <aside className="panel" aria-label={espace === 'configuration' ? 'Panneau de l’étape' : 'Supervision'}>
            <div className="zone-hote" ref={refs.panneau} />
            {espace === 'configuration' && step <= 5 && <PiedConfiguration step={step as EtapeConfig} avecBatiment={hasBuildings} />}
          </aside>
        )}
        {/* La page de l'écran : elle n'affiche rien ici, elle remplit les zones ci-dessus. */}
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
        <AccessDialog />
        <OrganisationDialog />
        <InterventionDialog />
        <ReplayDialog />
        <AssistantPanel />
        {/* Hors de la scène : la légende de la visite reste lisible au-dessus des fenêtres qu'elle ouvre. */}
        <CaptionBar />
        {/* Avis en haut de la scène (la fiche de la pièce, au milieu, n'est jamais couverte), au-dessus des fenêtres. */}
        <Toasts surScene={!pleinePage} />
      </div>
    </ZonesProvider>
  );
}
