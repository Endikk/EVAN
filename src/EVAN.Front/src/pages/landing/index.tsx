/**
 * Accueil public, en version nuit par défaut, sur un seul écran : la page ne défile jamais.
 *
 * La presse flexo du parc en 3D est l'héroïne, toujours au centre de l'écran, la plus grande possible au-dessus des
 * blocs du bas. Il n'y a presque rien d'autre : en bas à gauche, ce que fait EVAN et les deux actions ; en bas à
 * droite, trois vues de la presse. « Provoquer une panne » l'arrête : la caméra va sur la pièce, la presse s'estompe
 * autour, et une étiquette posée dessus dit ce qu'il faut vérifier. « Comment ça marche » ouvre le volet du parcours.
 *
 * Sur un écran étroit ou en portrait, tout s'empile : le titre, la presse, les vues, les deux actions.
 *
 * À la première visite, un film de 5,5 s ouvre la page (film/, docs/film-accueil/) : un travelling le long de la presse
 * que la lumière d'EVAN balaie et met en route, jusqu'au dernier rouleau, dont le point devient celui du titre. Le moindre
 * geste le termine.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Moon, Sun } from 'lucide-react';
import { EvanLogo } from '@/ui/EvanLogo';
import { setTabStatus } from '@/ui/brand';
import { PixelField } from '@/ui/PixelField';
import { useIsDark, useReducedMotion, useUi } from '@/store/ui';
import { hasSavedAssistant } from '@/store/project';
import { useSession } from '@/store/session';
import { CODE_PANNE, type VueId } from './lib/sections';
import { Actions } from './features/Actions';
import { Vues } from './features/Vues';
import { VoletParcours } from './features/VoletParcours';
import { useMedia } from './hooks/useMedia';
import { useCadre } from './hooks/useCadre';
import { useFilm } from './film/useFilm';
import './index.css';
import './film/film.css';

const LandingStage = lazy(() => import('./features/LandingStage'));

/** Écran étroit ou en portrait : le titre, la presse, puis les commandes, empilés. Mêmes bornes que index.css. */
const EMPILE = '(max-width: 860px), (max-aspect-ratio: 1/1)';
/** Téléphone : les libellés courts des vues. */
const TELEPHONE = '(max-width: 520px)';

const cascade = (i: number) => ({ '--i': i }) as CSSProperties;

/** Sans WebGL, la page reste lisible : seul le modèle 3D disparaît (et le film d'ouverture rend la main). */
class StageBoundary extends Component<{ children: ReactNode; fallback: ReactNode; onError?(): void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Landing() {
  const [vue, setVue] = useState<VueId>('accueil');
  const [ready, setReady] = useState(false);
  const [parcours, setParcours] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const texteRef = useRef<HTMLDivElement>(null);
  const vuesRef = useRef<HTMLDivElement>(null);
  const lpRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const pointRef = useRef<HTMLElement>(null);
  const panneRef = useRef<HTMLButtonElement>(null);
  // Le film mesure encore une carte et une étiquette qui ne sont plus sur la page : elles restent vides.
  const sansCarte = useRef<HTMLElement>(null);
  const reduit = useReducedMotion();
  const nuit = useIsDark();
  const empile = useMedia(EMPILE);
  const telephone = useMedia(TELEPHONE);
  const saved = hasSavedAssistant();
  const filmRefs = useMemo(
    () => ({ lp: lpRef, hero: heroRef, scene: sceneRef, point: pointRef, puce: panneRef, carte: sansCarte, pastille: sansCarte }),
    [],
  );
  const { horloge, phase: phaseFilm } = useFilm(filmRefs, reduit);
  // Une fois joué, le film garde la main sur les entrées : les animations CSS habituelles ne rejouent pas derrière lui.
  const filmJoue = !!horloge;
  const film = horloge && phaseFilm !== 'fin' ? horloge : null;
  const entree = filmJoue ? '' : 'entree';
  // Avec un serveur EVAN derrière, l'accès au compte de son organisation ; sans serveur, il n'y a pas de compte.
  const session = useSession((s) => s.etat);
  useEffect(() => void useSession.getState().verifier(), []);
  // Une usine déjà commencée dans ce navigateur se reprend : ?nouveau=1 repartirait d'une usine vierge.
  const assistantTo = saved ? '/assistant' : '/assistant?nouveau=1';

  // Une vue déjà montrée, choisie de nouveau, ramène à l'ensemble.
  const choisir = useCallback((v: VueId) => setVue((avant) => (avant === v ? 'accueil' : v)), []);

  useEffect(() => {
    // Volet ouvert : Échap le ferme, lui seul (il écoute de son côté).
    if (parcours) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVue('accueil');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [parcours]);

  // La panne montrée passe aussi dans l'onglet (point rouge, code dans le titre).
  const panne = vue === 'panne';
  useEffect(() => setTabStatus(panne ? 'crit' : 'ok', panne ? `Panne ${CODE_PANNE}` : undefined), [panne]);
  useEffect(() => () => setTabStatus('ok'), []);

  const obstacles = useMemo(() => [texteRef, vuesRef], []);
  const cadre = useCadre(sceneRef, obstacles, String(empile));
  const onReady = useCallback(() => {
    setReady(true);
    horloge?.signalerPret();
  }, [horloge]);
  const fermerParcours = useCallback(() => setParcours(false), []);

  return (
    <div ref={lpRef} className={`lp ${panne ? 'is-panne' : ''} ${filmJoue ? 'film-joue' : ''} ${film ? 'is-film' : ''}`}>
      <header className="lp-tete">
        <Link to="/" className="lp-marque" aria-label="EVAN, accueil" onClick={() => setVue('accueil')}>
          <EvanLogo size={28} status={panne ? 'crit' : 'ok'} pulse={panne} />
        </Link>
        <div className="lp-tete-actions">
          <button type="button" className="lp-lien" aria-haspopup="dialog" onClick={() => setParcours(true)}>
            Comment ça marche
          </button>
          {(session === 'anonyme' || session === 'connecte') && (
            <Link to="/compte" className="lp-lien">
              {session === 'connecte' ? 'Mon compte' : 'Se connecter'}
            </Link>
          )}
          <button
            type="button"
            className="lp-rond"
            onClick={() => useUi.getState().setTheme(nuit ? 'light' : 'dark')}
            aria-label={nuit ? 'Passer en thème jour' : 'Passer en thème nuit'}
            title={nuit ? 'Thème jour' : 'Thème nuit'}
          >
            {nuit ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main ref={heroRef} className="lp-hero" aria-labelledby="lp-titre">
        <div className="lp-nuage" aria-hidden="true">
          <PixelField placement="hero" intensite={1.25} motif="spires" />
        </div>

        <div className="lp-scene" ref={sceneRef}>
          <div className={`lp-toile ${ready ? 'is-ready' : ''}`}>
            <StageBoundary fallback={null} onError={() => horloge?.passer()}>
              <Suspense fallback={null}>
                <LandingStage vue={vue} cadre={cadre} dark={nuit} reduced={reduit} actif={!parcours} onReady={onReady} film={film} phaseFilm={phaseFilm} />
              </Suspense>
            </StageBoundary>
          </div>
          {!ready && (
            <div className="lp-chargement" role="status">
              <i aria-hidden="true">
                <b />
              </i>
              <span>Mise en route de la presse…</span>
            </div>
          )}
        </div>

        <div className="lp-texte" ref={texteRef}>
          <div className="lp-intro">
            <p className={`lp-surtitre ${entree}`} style={cascade(0)}>
              Supervision d’usine
            </p>
            <h1 id="lp-titre" className={`lp-titre ${entree}`} style={cascade(1)}>
              <span className="lp-ligne">
                <span>Toute votre usine.</span>
              </span>{' '}
              {/* Le point final est le point d'état du logo : vert, rouge quand on montre la panne. */}
              <span className="lp-ligne lp-ligne-2">
                <span>
                  Jusqu’au dernier rouleau
                  <i ref={pointRef} className="lp-point" aria-hidden="true" />
                </span>
              </span>
            </h1>
            <p className={`lp-phrase ${entree}`} style={cascade(2)}>
              EVAN suit vos machines en direct. Quand l’une s’arrête, il montre la pièce en cause et ce qu’il faut vérifier.
            </p>
          </div>
          <div className={`lp-actions ${entree}`} style={cascade(3)}>
            <Actions assistantTo={assistantTo} saved={saved} />
          </div>
        </div>

        <Vues ref={vuesRef} panneRef={panneRef} vue={vue} onChange={choisir} court={telephone} className={entree} style={cascade(4)} />

        {filmJoue && (
          <span className="lp-film-point" aria-hidden="true">
            <i />
          </span>
        )}
      </main>

      {parcours && <VoletParcours fermer={fermerParcours} assistantTo={assistantTo} saved={saved} />}
    </div>
  );
}
