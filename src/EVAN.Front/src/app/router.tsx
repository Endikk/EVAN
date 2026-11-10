/**
 * Routes de l'application. L'accueil, le compte (/compte : connexion à son organisation), puis l'espace de travail
 * sous /demo et /assistant : une mise en page commune (pages/workspace) et un écran par adresse, /demo/plan,
 * /demo/supervision… Ajouter un écran = une page dans src/pages/<écran>/index.tsx, son adresse dans
 * widgets/shell/ecrans.ts et une entrée dans PAGES.
 */
import { Suspense, lazy, useEffect, type ComponentType } from 'react';
import { createBrowserRouter, Link, useLocation, useRouteError, type RouteObject } from 'react-router';
import { ArrowRight, Home, RefreshCw, Trash2 } from 'lucide-react';
import { Landing } from '@/pages/landing';
import { clearSavedAssistant, type ProjectMode } from '@/store/project';
import { isChunkError } from '@/ui/ErrorBoundary';
import { setTabPage } from '@/ui/brand';
import { EvanLogo } from '@/ui/EvanLogo';
import { PixelField } from '@/ui/PixelField';
import { quandAuRepos } from '@/ui/repos';
import { chemin, lireChemin, slugDe, type Slug } from '@/widgets/shell/ecrans';
import { EXPLOIT_TABS } from '@/widgets/shell/steps';
import { brancherRouteur } from '@/widgets/shell/routeur';

type ChargerPage = () => Promise<{ default: ComponentType }>;

/** Une page par écran, chargée à la demande. */
const CHARGER: Record<Slug, ChargerPage> = {
  localiser: () => import('@/pages/localiser').then((m) => ({ default: m.LocaliserPage })),
  plan: () => import('@/pages/plan').then((m) => ({ default: m.PlanPage })),
  machines: () => import('@/pages/machines').then((m) => ({ default: m.MachinesPage })),
  organes: () => import('@/pages/organes').then((m) => ({ default: m.OrganesPage })),
  connexion: () => import('@/pages/connexion').then((m) => ({ default: m.ConnexionPage })),
  supervision: () => import('@/pages/supervision').then((m) => ({ default: m.SupervisionPage })),
  historique: () => import('@/pages/historique').then((m) => ({ default: m.HistoriquePage })),
  maintenance: () => import('@/pages/maintenance').then((m) => ({ default: m.MaintenancePage })),
  energie: () => import('@/pages/energie').then((m) => ({ default: m.EnergiePage })),
  organisation: () => import('@/pages/organisation').then((m) => ({ default: m.OrganisationPage })),
};

const PAGES = Object.entries(CHARGER).map(([path, charger]) => ({ path, Page: lazy(charger) }));

/** Compte : hors de l'espace de travail, chargé seulement quand on l'ouvre. */
const Compte = lazy(() => import('@/pages/compte').then((m) => ({ default: m.ComptePage })));

/** Les écrans par lesquels on entre le plus souvent, chargés d'avance : les ouvrir ensuite est immédiat. */
const PRECHARGES: readonly Slug[] = ['localiser', 'plan', 'machines', 'supervision'];

/** Un préchargement manqué (réseau) n'est pas une erreur : la page se recharge à la demande quand on l'ouvre. */
const precharger = (slug: Slug) => void CHARGER[slug]().catch(() => undefined);

const Workspace = lazy(() => {
  // L'écran de l'adresse part avec la mise en page, sans attendre qu'elle s'affiche pour être demandé ; les autres
  // attendent (Precharges). Sur /demo seul, l'écran n'est connu qu'au chargement du projet : les écrans habituels
  // partent tout de suite.
  const ecran = lireChemin(window.location.pathname)?.ecran;
  if (ecran === undefined) PRECHARGES.forEach(precharger);
  else precharger(slugDe(ecran));
  return import('@/pages/workspace').then((m) => ({ default: m.Workspace }));
});

/**
 * Les écrans habituels, une fois l'espace de travail affiché et le navigateur au repos : leur code (moteur 3D,
 * graphiques) ne retarde plus l'écran ouvert, et ils sont prêts quand on y va.
 */
function Precharges() {
  useEffect(() => quandAuRepos(() => PRECHARGES.forEach(precharger)), []);
  return null;
}

/**
 * Le temps que l'espace de travail arrive (moteur 3D, carte) : le logo, une phrase, et une barre qui avance sans
 * prétendre à un pourcentage qu'on ne connaît pas.
 */
function Loading() {
  return (
    <div className="hors-route chargement" role="status" aria-live="polite">
      <div className="hr-contenu">
        <EvanLogo size={34} pulse />
        <p className="hr-phrase">Chargement d’EVAN…</p>
        <span className="hr-barre" aria-hidden>
          <i />
        </span>
      </div>
    </div>
  );
}

/** Adresse inconnue : on le dit simplement, avec de quoi repartir (l'accueil, ou un écran de la démo). */
function NotFound() {
  const { pathname } = useLocation();
  useEffect(() => {
    setTabPage('Page introuvable');
    return () => setTabPage(undefined);
  }, []);
  return (
    <main className="hors-route">
      <PixelField placement="hero" intensite={1} />
      <div className="hr-contenu entree">
        <Link to="/" aria-label="EVAN, accueil" className="hr-logo">
          <EvanLogo size={30} status="warn" />
        </Link>
        <p className="hr-code">Erreur 404</p>
        <h1>Cette page n’existe pas</h1>
        <p className="hr-texte">
          L’adresse <code>{pathname}</code> ne mène à aucun écran d’EVAN. Le lien est peut-être ancien, ou l’adresse a été mal recopiée.
        </p>
        <div className="hr-actions">
          <Link to="/" className="btn primary">
            <Home aria-hidden /> Retour à l’accueil
          </Link>
        </div>
        <nav className="hr-ecrans" aria-label="Écrans de la démonstration">
          <h2>Ou ouvrez un écran de la démonstration</h2>
          <ul>
            {EXPLOIT_TABS.map((t, i) => (
              <li key={t.n} className="entree" style={{ ['--i' as string]: i + 2 }}>
                <Link to={chemin('demo', t.n)}>
                  <t.icon aria-hidden />
                  <span>
                    <b>{t.titre}</b>
                    <small>{t.action}</small>
                  </span>
                  <ArrowRight aria-hidden className="hr-fleche" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}

/**
 * Dernier recours : une erreur que rien n'a rattrapée. Au lieu d'une page blanche, un moyen de repartir, y compris
 * quand la cause est une sauvegarde locale illisible (elle ferait échouer chaque rechargement).
 */
function RouteError() {
  const error = useRouteError();
  // Après un déploiement, un onglet resté ouvert peut demander un fichier qui n'existe plus : recharger suffit.
  const chunk = isChunkError(error);
  return (
    <div role="alert" className="hors-route">
      <div className="hr-contenu entree">
        <EvanLogo size={30} status={chunk ? 'warn' : 'crit'} />
        <p className="hr-code">{chunk ? 'Nouvelle version' : 'Erreur'}</p>
        <h1>{chunk ? 'EVAN a été mis à jour' : 'Une erreur a interrompu EVAN'}</h1>
        <p className="hr-texte">
          {chunk
            ? 'Cet onglet affiche encore l’ancienne version. Rechargez la page pour passer à la nouvelle : vos données ne sont pas perdues.'
            : 'Rechargez la page, cela suffit le plus souvent. Si l’erreur revient sur votre usine, effacez la version enregistrée dans ce navigateur : vous repartirez d’une usine vierge.'}
        </p>
        <div className="hr-actions">
          <button className="btn primary" onClick={() => location.reload()}>
            <RefreshCw aria-hidden /> Recharger la page
          </button>
          {!chunk && (
            <button
              className="btn"
              onClick={() => {
                clearSavedAssistant();
                location.assign('/');
              }}
              title="Efface l’usine enregistrée dans ce navigateur, puis revient à l’accueil"
            >
              <Trash2 aria-hidden /> Effacer l’usine enregistrée
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** L'espace de travail d'un mode : la mise en page, et un écran par adresse (/demo seul ouvre l'écran qui convient). */
function espaceDeTravail(mode: ProjectMode): RouteObject {
  return {
    path: `/${mode}`,
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<Loading />}>
        {/* Une instance par mode : passer de la démo à son usine recharge tout l'espace de travail. */}
        <Workspace key={mode} mode={mode} />
        <Precharges />
      </Suspense>
    ),
    children: [{ index: true, element: null }, ...PAGES.map(({ path, Page }) => ({ path, element: <Page /> }))],
  };
}

export const router = createBrowserRouter([
  { path: '/', element: <Landing />, errorElement: <RouteError /> },
  {
    path: '/compte',
    errorElement: <RouteError />,
    element: (
      <Suspense fallback={<Loading />}>
        <Compte />
      </Suspense>
    ),
  },
  espaceDeTravail('demo'),
  espaceDeTravail('assistant'),
  { path: '*', element: <NotFound /> },
]);

brancherRouteur({
  naviguer: (to, opts) => void router.navigate(to, opts),
  lieu: () => router.state.location,
});
