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
 * À la première visite, un film de 5,5 s ouvre la page (film/) : un travelling le long de la presse
 * que la lumière d'EVAN balaie et met en route, jusqu'au dernier rouleau, dont le point devient celui du titre. Le moindre
 * geste le termine.
 *
 * Sans WebGL (ou si la presse ne se charge pas), la page reste lisible : un message prend la place de la presse, et les
 * vues, qui n'auraient rien à montrer, disparaissent.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Moon, Sun } from 'lucide-react';
import { EvanLogo } from '@/ui/EvanLogo';
import { setTabStatus } from '@/ui/brand';
import { useIsDark, useReducedMotion, useUi } from '@/store/ui';
import { hasSavedAssistant } from '@/store/project';
import { useSession } from '@/store/session';
import { CODE_PANNE, PIECES, annonceVue, numeroPiece, type VueId } from './lib/sections';
import { actionUsine } from './lib/actions';
import { webglDisponible } from './lib/webgl';
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
/**
 * Libellés courts des vues : sur téléphone, et sur un écran de largeur moyenne où les vues partagent la ligne des
 * actions (au-delà de 1180 px, les libellés entiers tiennent à côté des deux boutons).
 */
const LIBELLES_COURTS = '(max-width: 520px), (min-width: 861px) and (max-width: 1180px) and (min-aspect-ratio: 1/1)';

/** Deuxième ligne du titre : son dernier mot reste collé au point d'état quand la ligne se coupe sur téléphone. */
const LIGNE_2 = 'Jusqu’au dernier rouleau';
const COUPE = LIGNE_2.lastIndexOf(' ') + 1;

const cascade = (i: number) => ({ '--i': i }) as CSSProperties;

/** Presse qui ne s'affiche pas : WebGL absent du navigateur, ou erreur au chargement du modèle. */
type Echec3D = 'webgl' | 'erreur';

const MESSAGE_3D: Record<Echec3D, string> = {
  webgl: 'La presse en 3D ne peut pas s’afficher. Ce navigateur n’a pas WebGL.',
  erreur: 'La presse en 3D n’a pas pu se charger. Rechargez la page pour réessayer.',
};

/** Presse qui échoue en cours de route (contexte WebGL refusé, modèle introuvable) : la page le dit à sa place, et le film d'ouverture rend la main. */
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
  // La presse a dessiné sa première image : pendant le film, elle est déjà à l'écran (sans fondu d'entrée).
  const [dessinee, setDessinee] = useState(false);
  const [parcours, setParcours] = useState(false);
  const [echec3D, setEchec3D] = useState<Echec3D | null>(() => (webglDisponible() ? null : 'webgl'));
  // Vue des pièces sur un écran étroit : numéros seuls sur la presse, noms dans la légende (LandingStage, Pieces).
  const [piecesCompactes, setPiecesCompactes] = useState(false);
  // Ce que le lecteur d'écran entend quand la vue change : rien au chargement, la vue de départ est décrite par le titre.
  const [annonce, setAnnonce] = useState('');
  const vueAnnoncee = useRef<VueId>('accueil');
  const sceneRef = useRef<HTMLDivElement>(null);
  const texteRef = useRef<HTMLDivElement>(null);
  const vuesRef = useRef<HTMLDivElement>(null);
  const legendeRef = useRef<HTMLOListElement>(null);
  const lpRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const pointRef = useRef<HTMLElement>(null);
  const panneRef = useRef<HTMLButtonElement>(null);
  // Le film mesure encore une carte et une étiquette qui ne sont plus sur la page : elles restent vides.
  const sansCarte = useRef<HTMLElement>(null);
  const reduit = useReducedMotion();
  const nuit = useIsDark();
  const empile = useMedia(EMPILE);
  const court = useMedia(LIBELLES_COURTS);
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
  // Compte connecté : ses usines, sur le serveur. Sinon, l'usine du navigateur (lib/actions.ts).
  const usine = actionUsine(session, saved);

  // Une vue déjà montrée, choisie de nouveau, ramène à l'ensemble.
  const choisir = useCallback((v: VueId) => setVue((avant) => (avant === v ? 'accueil' : v)), []);

  useEffect(() => {
    // Volet ouvert : Échap le ferme, lui seul (il écoute de son côté).
    if (parcours) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setVue('accueil');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [parcours]);

  // La panne montrée passe aussi dans l'onglet (point rouge, code dans le titre).
  const panne = vue === 'panne';
  useEffect(() => setTabStatus(panne ? 'crit' : 'ok', panne ? `Panne ${CODE_PANNE}` : undefined), [panne]);
  useEffect(() => () => setTabStatus('ok'), []);
  useEffect(() => {
    if (vueAnnoncee.current === vue) return;
    vueAnnoncee.current = vue;
    setAnnonce(annonceVue(vue));
  }, [vue]);

  const legende = vue === 'pieces' && piecesCompactes && !echec3D;

  // La légende des pièces, quand elle est là, se pose sous la presse : la caméra la laisse libre.
  const obstacles = useMemo(() => [texteRef, vuesRef, legendeRef], []);
  const cadre = useCadre(sceneRef, obstacles, `${empile}|${legende}`);
  const onReady = useCallback(() => {
    setReady(true);
    horloge?.signalerPret();
  }, [horloge]);
  const fermerParcours = useCallback(() => setParcours(false), []);
  const premiereImage = useCallback(() => setDessinee(true), []);
  // Hors film, la presse n'apparaît qu'une fois prête (fondu de .lp-toile) : le chargement reste jusque-là. Pendant le
  // film, la toile est visible tout de suite : le chargement s'efface dès que la presse s'y dessine.
  const chargement = !ready && !echec3D && !(film && dessinee);
  const presseEnPanne = useCallback(() => {
    setEchec3D('erreur');
    horloge?.passer();
  }, [horloge]);

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
            className="btn icon ghost lp-theme"
            onClick={() => useUi.getState().setTheme(nuit ? 'light' : 'dark')}
            aria-label={nuit ? 'Passer en thème jour' : 'Passer en thème nuit'}
            title={nuit ? 'Thème jour' : 'Thème nuit'}
          >
            {nuit ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          </button>
        </div>
      </header>

      <main ref={heroRef} className="lp-hero" aria-labelledby="lp-titre">
        <div className="lp-scene" ref={sceneRef}>
          {echec3D ? (
            <p className="lp-sans3d">{MESSAGE_3D[echec3D]}</p>
          ) : (
            <div className={`lp-toile ${ready ? 'is-ready' : ''}`}>
              <StageBoundary fallback={null} onError={presseEnPanne}>
                <Suspense fallback={null}>
                  <LandingStage
                    vue={vue}
                    cadre={cadre}
                    dark={nuit}
                    reduced={reduit}
                    actif={!parcours}
                    onReady={onReady}
                    onPremiereImage={premiereImage}
                    film={film}
                    phaseFilm={phaseFilm}
                    onPiecesCompactes={setPiecesCompactes}
                  />
                </Suspense>
              </StageBoundary>
            </div>
          )}
          {chargement && (
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
                  {LIGNE_2.slice(0, COUPE)}
                  <span className="lp-insecable">
                    {LIGNE_2.slice(COUPE)}
                    <i ref={pointRef} className="lp-point" aria-hidden="true" />
                  </span>
                </span>
              </span>
            </h1>
            <p className={`lp-phrase ${entree}`} style={cascade(2)}>
              EVAN suit vos machines en direct. Quand l’une s’arrête, il montre la pièce en cause et ce qu’il faut vérifier.
            </p>
          </div>
          <div className={`lp-actions ${entree}`} style={cascade(3)}>
            <Actions usine={usine} />
          </div>
        </div>

        {!echec3D && <Vues ref={vuesRef} panneRef={panneRef} vue={vue} onChange={choisir} court={court} className={entree} style={cascade(4)} />}
        {legende && (
          <ol ref={legendeRef} className="lp-legende" aria-label="Pièces surveillées">
            {PIECES.map((p) => (
              <li key={p.numero}>
                <b>{numeroPiece(p.numero)}</b> {p.nom}
              </li>
            ))}
          </ol>
        )}
        <p className="sr-only" aria-live="polite">
          {annonce}
        </p>

        {filmJoue && (
          <span className="lp-film-point" aria-hidden="true">
            <i />
          </span>
        )}
      </main>

      {parcours && <VoletParcours fermer={fermerParcours} usine={usine} />}
    </div>
  );
}
