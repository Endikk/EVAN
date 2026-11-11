/**
 * Barre latérale de l'espace de travail, la même sur tous les écrans : le logo, les usines de l'organisation (on en
 * change ici), puis les écrans de l'usine ouverte, ou ses cinq étapes quand la configuration est ouverte. En bas, la
 * visite guidée et les réglages d'affichage.
 *
 * Grand écran : repliable en icônes seules (choix gardé). Tablette : icônes seules. Téléphone : menu qui glisse
 * par-dessus l'écran, ouvert depuis la barre du haut.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Factory, LogIn, Moon, MonitorPlay, PanelLeftClose, PanelLeftOpen, Pause, Play, Settings2, Sun, UserRound, Waves, X } from 'lucide-react';
import { useProject } from '@/store/project';
import { useSession } from '@/store/session';
import { useLive } from '@/store/live';
import { useEspace, useIsDark, useReducedMotion, useUi } from '@/store/ui';
import { StatusIcon } from '@/ui/status';
import { usePiegeFocus } from '@/ui/usePiegeFocus';
import { UsineMenu } from '@/widgets/usines/UsineMenu';
import { UsinesListe } from '@/widgets/usines/UsinesListe';
import { CHAPITRES, pauseTour, startTour, stopTour } from '@/widgets/tour/tour';
import { LogoVoyageur, noterPositionLogo, useLogoEnHaut } from './LogoVoyageur';
import { EtapesConfig } from './StepRail';
import { EXPLOIT_TABS } from './steps';
import { goToStep, requestConfiguration } from './navigation';
import { useCoquille } from './coquille';
import { panneOuverte } from './panneOuverte';

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Les écrans de l'usine ouverte, chacun avec ce qu'on y fait, puis l'entrée de la configuration. L'entrée Supervision
 * porte une marque tant qu'une panne reste ouverte, pour qu'elle ne s'oublie pas depuis un autre écran.
 */
function Ecrans({ apres }: { apres: () => void }) {
  const step = useUi((s) => s.step);
  const vueOrganisation = useUi((s) => s.vueOrganisation);
  const demo = useProject((s) => s.mode === 'demo');
  const alarms = useLive((s) => s.alarms);
  const machines = useProject((s) => s.machines);
  const panne = useMemo(() => panneOuverte(alarms, machines), [alarms, machines]);
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
              title={`${t.titre} : ${minuscule(t.action)}${t.n === 6 && panne ? `. ${panne.libelle}` : ''}`}
            >
              <span className="side-icone" aria-hidden>
                <t.icon />
              </span>
              <span className="side-txt">
                <b>{t.titre}</b>
              </span>
              {t.n === 6 && panne && (
                <span className={`side-marque ${panne.exercice ? 'exercice' : ''}`}>
                  <StatusIcon etat="panne" size={10} animate={false} />
                  <span className="sr-only">, {panne.libelle.toLowerCase()}</span>
                </span>
              )}
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
            {/* Un seul nom pour entrer en configuration, en démonstration comme sur son usine. */}
            <span className="side-txt">
              <b>Modifier l’usine</b>
            </span>
          </button>
        </li>
      </ul>
    </section>
  );
}

/**
 * Configuration ouverte : ses étapes. Une seule sortie, « Terminer la configuration » (barre du haut, bas du panneau à
 * la dernière étape) : elle enregistre et l'inscrit au journal. L'ancien « Revenir à la supervision » sortait sans
 * l'un ni l'autre.
 */
function Configuration({ apres }: { apres: () => void }) {
  return <EtapesConfig apres={apres} />;
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
      <div className="side-pied-actions">
        {mode === 'demo' && (
          <button
            className="side-item"
            data-visite
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
            {mode === 'demo' ? <Factory /> : <Play />}
          </span>
          <span className="side-txt">
            <b>{mode === 'demo' ? 'Créer mon usine' : 'Revoir la démo'}</b>
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
  const nav = useRef<HTMLElement>(null);
  const fermer = () => useCoquille.getState().setMenuOuvert(false);

  // Téléphone : le menu couvre l'écran. Piège de focus : il entre par « Fermer », Tab y reste, Échap le referme et
  // rend le focus au bouton du menu.
  usePiegeFocus(nav, menuOuvert, fermer);

  return (
    <>
      <nav ref={nav} className={`side ${replie ? 'replie' : ''} ${menuOuvert ? 'ouvert' : ''}`} aria-label="Usines et écrans">
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
          <button data-autofocus className="btn sm icon ghost side-fermer" onClick={fermer} aria-label="Fermer le menu" title="Fermer (Échap)">
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
