/**
 * Barre latérale de l'espace de travail, la même sur tous les écrans : le logo, les usines de l'organisation (on en
 * change ici), puis les écrans de l'usine ouverte, ou ses cinq étapes quand la configuration est ouverte. En bas, la
 * visite guidée et les réglages d'affichage.
 *
 * Grand écran : repliable en icônes seules (choix gardé). Tablette : icônes seules. Téléphone : menu qui glisse
 * par-dessus l'écran, ouvert depuis la barre du haut.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, LogIn, Moon, MonitorPlay, PanelLeftClose, PanelLeftOpen, Pause, Play, Rocket, Settings2, Sun, UserRound, Waves, X } from 'lucide-react';
import { useProject } from '@/store/project';
import { useSession } from '@/store/session';
import { useEspace, useIsDark, useReducedMotion, useUi } from '@/store/ui';
import { PixelField } from '@/ui/PixelField';
import { UsineMenu } from '@/widgets/usines/UsineMenu';
import { UsinesListe } from '@/widgets/usines/UsinesListe';
import { CHAPITRES, pauseTour, startTour, stopTour } from '@/widgets/tour/tour';
import { LogoVoyageur, noterPositionLogo, useLogoEnHaut } from './LogoVoyageur';
import { EtapesConfig } from './StepRail';
import { EXPLOIT_TABS } from './steps';
import { goToStep, requestConfiguration } from './navigation';
import { useCoquille } from './coquille';

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Les écrans de l'usine ouverte, chacun avec ce qu'on y fait, puis l'entrée de la configuration. */
function Ecrans({ apres }: { apres: () => void }) {
  const step = useUi((s) => s.step);
  const vueOrganisation = useUi((s) => s.vueOrganisation);
  const demo = useProject((s) => s.mode === 'demo');
  return (
    <section className="side-section side-ecrans" aria-labelledby="side-ecrans-titre">
      <div className="side-section-tete">
        <h2 id="side-ecrans-titre">Cette usine</h2>
      </div>
      <ul className="side-liste">
        {EXPLOIT_TABS.map((t) => (
          <li key={t.n}>
            <button
              className="side-item side-ecran"
              aria-current={t.n === step && !vueOrganisation ? 'page' : undefined}
              onClick={() => {
                apres();
                void goToStep(t.n);
              }}
              title={`${t.titre} : ${minuscule(t.action)}`}
            >
              <span className="side-icone" aria-hidden>
                <t.icon />
              </span>
              <span className="side-txt">
                <b>{t.titre}</b>
                <small>{t.action}</small>
              </span>
            </button>
          </li>
        ))}
        <li className="side-sep" role="separator" />
        <li>
          <button
            className="side-item"
            onClick={() => {
              apres();
              stopTour();
              requestConfiguration(1);
            }}
            title={
              demo
                ? 'Modifier l’usine d’exemple ouverte : carte, plan, machines, branchements. En démonstration, rien n’est gardé.'
                : 'Modifier l’usine ouverte : carte, plan, machines, branchements. L’accès est protégé et noté au journal.'
            }
          >
            <span className="side-icone" aria-hidden>
              <Settings2 />
            </span>
            <span className="side-txt">
              <b>{demo ? 'Modifier cette usine' : 'Configurer l’usine'}</b>
              <small>{demo ? 'L’exemple, pour essayer' : 'Carte, plan, machines, branchements'}</small>
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}

/** Configuration ouverte : ses étapes, et le retour à la supervision si l'usine est déjà en service. */
function Configuration({ apres }: { apres: () => void }) {
  const configure = useProject((s) => s.configure);
  return (
    <>
      <EtapesConfig apres={apres} />
      {configure && (
        <button
          className="side-item side-retour"
          onClick={() => {
            apres();
            stopTour();
            void goToStep(6);
          }}
          title="Quitter la configuration sans rien changer d’autre : les modifications déjà faites sont gardées."
        >
          <span className="side-icone" aria-hidden>
            <ArrowLeft />
          </span>
          <span className="side-txt">
            <b>Revenir à la supervision</b>
          </span>
        </button>
      )}
    </>
  );
}

/**
 * Qui est connecté, et l'accès à la page du compte (déconnexion, membres, passerelles). Sans serveur EVAN, il n'y a
 * pas de compte : rien ne s'affiche.
 */
function Compte({ apres }: { apres: () => void }) {
  const etat = useSession((s) => s.etat);
  const utilisateur = useSession((s) => s.utilisateur);
  const organisation = useSession((s) => s.organisation);
  const navigate = useNavigate();
  useEffect(() => void useSession.getState().verifier(), []);
  if (etat !== 'connecte' && etat !== 'anonyme') return null;
  const connecte = etat === 'connecte' && utilisateur;
  return (
    <button
      className="side-item"
      onClick={() => {
        apres();
        stopTour();
        navigate('/compte');
      }}
      title={connecte ? `Connecté : ${utilisateur.nom} (${organisation?.nom ?? ''}). Compte, membres, déconnexion.` : 'Se connecter au compte de votre organisation'}
    >
      <span className="side-icone" aria-hidden>
        {connecte ? <UserRound /> : <LogIn />}
      </span>
      <span className="side-txt">
        <b className="truncate">{connecte ? utilisateur.nom : 'Se connecter'}</b>
        <small className="truncate">{connecte ? organisation?.nom : 'Compte de votre organisation'}</small>
      </span>
    </button>
  );
}

/** Pied : visite guidée, démo ou usine, compte, thème et animations. */
function Pied({ apres }: { apres: () => void }) {
  const mode = useProject((s) => s.mode);
  const tour = useUi((s) => s.tour);
  const dark = useIsDark();
  const reduced = useReducedMotion();
  const navigate = useNavigate();
  return (
    <div className="side-pied">
      <PixelField placement="bas-droite" intensite={0.75} />
      <div className="side-pied-actions">
        {mode === 'demo' && (
          <button
            className="side-item"
            onClick={() => {
              apres();
              if (tour.playing) pauseTour();
              else void startTour(tour.chapitre ?? 1);
            }}
            title="EVAN se présente tout seul, écran par écran. Un clic dans la scène met la visite en pause."
          >
            <span className="side-icone" aria-hidden>
              {tour.playing ? <Pause /> : <MonitorPlay />}
            </span>
            <span className="side-txt">
              <b>{tour.playing ? 'Mettre la visite en pause' : tour.chapitre ? 'Reprendre la visite' : 'Visite guidée'}</b>
              {tour.chapitre && !tour.playing && <small>Chapitre {tour.chapitre} sur {CHAPITRES.length}</small>}
            </span>
          </button>
        )}
        <button
          className="side-item"
          onClick={() => {
            apres();
            stopTour();
            navigate(mode === 'demo' ? '/assistant?nouveau=1' : '/demo');
          }}
          title={
            mode === 'demo'
              ? 'Quitter la démonstration et décrire votre propre usine, en partant de son adresse. Elle est gardée dans ce navigateur.'
              : 'Revenir à l’usine d’exemple'
          }
        >
          <span className="side-icone" aria-hidden>
            {mode === 'demo' ? <Rocket /> : <Play />}
          </span>
          <span className="side-txt">
            <b>{mode === 'demo' ? 'Créer mon usine' : 'Revoir la démo'}</b>
            {mode === 'demo' && <small>Quitter la démo</small>}
          </span>
        </button>
        <Compte apres={apres} />
        <div className="side-reglages" role="group" aria-label="Affichage">
          {/* Pas d'aria-pressed : le libellé dit déjà l'action, et le bouton ne restait allumé en accent que le jour. */}
          <button
            className="btn sm icon ghost"
            onClick={() => useUi.getState().setTheme(dark ? 'light' : 'dark')}
            aria-label={dark ? 'Passer au thème jour' : 'Passer au thème nuit'}
            title={dark ? 'Thème jour' : 'Thème nuit'}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          <button
            className="btn sm icon ghost"
            aria-pressed={reduced}
            onClick={() => useUi.getState().setReducedMotionUser(!reduced)}
            aria-label="Réduire les animations"
            title={reduced ? 'Animations réduites : cliquer pour les remettre' : 'Réduire les animations'}
          >
            <Waves />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const espace = useEspace();
  const replie = useCoquille((s) => s.replie);
  const menuOuvert = useCoquille((s) => s.menuOuvert);
  const logoEnHaut = useLogoEnHaut();
  const fermerBtn = useRef<HTMLButtonElement>(null);
  const fermer = () => useCoquille.getState().setMenuOuvert(false);

  // Téléphone : Échap referme le menu, le focus va sur « Fermer » à l'ouverture.
  useEffect(() => {
    if (!menuOuvert) return;
    fermerBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOuvert]);

  return (
    <>
      <nav className={`side ${replie ? 'replie' : ''} ${menuOuvert ? 'ouvert' : ''}`} aria-label="Usines et écrans">
        <div className="side-tete">
          {!logoEnHaut && <LogoVoyageur />}
          <button
            className="btn sm icon ghost side-replier"
            onClick={() => {
              noterPositionLogo();
              useCoquille.getState().setReplie(!replie);
            }}
            aria-label={replie ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
            title={replie ? 'Déplier : noms des usines et des écrans' : 'Replier : icônes seules, plus de place pour l’écran'}
          >
            {replie ? <PanelLeftOpen /> : <PanelLeftClose />}
          </button>
          <button ref={fermerBtn} className="btn sm icon ghost side-fermer" onClick={fermer} aria-label="Fermer le menu" title="Fermer (Échap)">
            <X />
          </button>
        </div>
        <div className="side-corps">
          <div className="side-usines-compact">
            <UsineMenu />
          </div>
          <UsinesListe apres={fermer} />
          {espace === 'exploitation' ? <Ecrans apres={fermer} /> : <Configuration apres={fermer} />}
        </div>
        <Pied apres={fermer} />
      </nav>
      {menuOuvert && <div className="side-fond" onClick={fermer} aria-hidden />}
    </>
  );
}
