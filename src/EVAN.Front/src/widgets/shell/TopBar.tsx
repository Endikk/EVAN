import { useMemo } from 'react';
import { ChevronRight, CheckCircle2, FlaskConical, LockOpen, Menu, MessageCircleQuestion } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi, useEspace } from '@/store/ui';
import { useLive } from '@/store/live';
import { useNow } from '@/ui/useNow';
import { StatusIcon } from '@/ui/status';
import { stopTour } from '@/widgets/tour/tour';
import { EtatEnregistrement } from '@/widgets/enregistrement/EtatEnregistrement';
import { finishConfiguration, focusAlarm, simulateFault } from './navigation';
import { panneOuverte } from './panneOuverte';
import { EXPLOIT_TABS, STEPS } from './steps';
import { useCoquille } from './coquille';
import { LogoVoyageur, useLogoEnHaut } from './LogoVoyageur';

/** Sans donnée depuis ce délai, un flux pourtant connecté est signalé figé (le lot normal arrive chaque seconde). */
const FIGE_MS = 5000;

const INFO_SIMULER =
  'Exercice : EVAN crée une panne sur une machine au hasard, puis montre comment il la détecte et vous mène jusqu’à l’organe en cause.';

type EtatFlux = 'direct' | 'simule' | 'fige' | 'coupe';

/** La forme dit l'état du flux autant que le mot : rond plein (frais), deux barres (figé), cercle qui tourne (coupé). */
function FormeFlux({ etat }: { etat: EtatFlux }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      {(etat === 'direct' || etat === 'simule') && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {etat === 'fige' && (
        <>
          <rect x="2" y="1.5" width="2.8" height="9" rx="1" fill="currentColor" />
          <rect x="7.2" y="1.5" width="2.8" height="9" rx="1" fill="currentColor" />
        </>
      )}
      {etat === 'coupe' && (
        <>
          <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.8" />
          <path className="conn-arc" d="M6 1.4a4.6 4.6 0 0 1 4.6 4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** État du flux temps réel : d'où viennent les données affichées, et si elles sont encore fraîches. */
function Connexion() {
  const source = useLive((s) => s.source);
  const connected = useLive((s) => s.connected);
  const lastDataAt = useLive((s) => s.lastDataAt);
  const now = useNow(1000);
  const fige = connected && lastDataAt !== undefined && now - lastDataAt > FIGE_MS;
  const etat: EtatFlux = !connected ? 'coupe' : fige ? 'fige' : source === 'api' ? 'direct' : 'simule';
  const mot = {
    direct: 'En direct',
    simule: 'Données simulées',
    fige: 'Données figées',
    coupe: source === 'api' ? 'Reconnexion…' : 'Connexion…',
  }[etat];
  // Version courte, sur tablette et téléphone : l'état du flux reste dit en toutes lettres, jamais réduit à un point.
  const court = { direct: 'Direct', simule: 'Simulé', fige: 'Figé', coupe: 'Coupé' }[etat];
  // Sur téléphone, le point seul suffit quand tout va bien ; un flux figé ou coupé garde son mot.
  const alerte = etat === 'fige' || etat === 'coupe';
  const explication = {
    direct: 'Les valeurs arrivent du serveur EVAN, qui lit les automates des machines. Elles se mettent à jour chaque seconde.',
    simule: 'Démonstration : les valeurs sont produites dans ce navigateur, au même rythme et dans le même format que celles des vraies machines.',
    fige: `Plus aucune valeur reçue depuis ${Math.round((now - (lastDataAt ?? now)) / 1000)} s : l’écran montre les dernières connues, qui ne sont peut-être plus vraies.`,
    coupe: 'La liaison avec les données est coupée : les valeurs affichées ne bougent plus. EVAN se reconnecte tout seul.',
  }[etat];
  return (
    <span className={`conn conn-${etat}`} role="status" aria-label={`Données : ${mot}`} title={explication}>
      <FormeFlux etat={etat} />
      <span className="conn-long" aria-hidden>
        {mot}
      </span>
      <span className={`conn-court ${alerte ? '' : 'hide-xs'}`} aria-hidden>
        {court}
      </span>
    </span>
  );
}

/**
 * Où l'on est, en clair : l'organisation et l'usine en petit, l'écran en grand. En configuration, l'étape en cours.
 */
function OuOnEst() {
  const organisation = useProject((s) => s.organisation.nom);
  const site = useProject((s) => s.site?.nom);
  const step = useUi((s) => s.step);
  const vueOrganisation = useUi((s) => s.vueOrganisation);
  const espace = useEspace();
  const ecran = vueOrganisation ? undefined : [...STEPS, ...EXPLOIT_TABS].find((e) => e.n === step);
  const titre = vueOrganisation ? 'Vue d’ensemble' : espace === 'configuration' ? `Étape ${step} sur 5 : ${ecran?.titre ?? ''}` : (ecran?.titre ?? 'EVAN');
  // Téléphone : « Étape 5 sur 5 : » se lit déjà dans le panneau, le titre garde le nom de l'étape en entier.
  const etape = espace === 'configuration' && !vueOrganisation ? `Étape ${step} sur 5 : ` : '';
  const chemin = [organisation || 'Mon organisation', vueOrganisation ? undefined : (site ?? 'Nouvelle usine')].filter(Boolean) as string[];
  return (
    <div className="ou-on-est">
      <nav className="fil" aria-label="Vous êtes ici">
        <ol>
          {chemin.map((c, i) => (
            <li key={i}>
              {i > 0 && <ChevronRight aria-hidden />}
              <span className="truncate">{c}</span>
            </li>
          ))}
          {espace === 'configuration' && (
            <li>
              <ChevronRight aria-hidden />
              <span>Configuration</span>
            </li>
          )}
        </ol>
      </nav>
      {/* La clé relance l'entrée du titre à chaque écran : on voit que l'écran a changé. Il reçoit le focus après un
          changement d'écran (pages/workspace), sans entrer dans l'ordre de tabulation. */}
      <h1 key={titre} className="ecran-titre truncate" tabIndex={-1}>
        {etape ? (
          <>
            <span className="hide-xs">{etape}</span>
            {ecran?.titre}
          </>
        ) : (
          titre
        )}
      </h1>
    </div>
  );
}

/**
 * Panne en cours, vue de tous les écrans d'exploitation : l'avis du coin disparaît au bout de 12 s, cette pastille
 * reste tant qu'une alarme critique est ouverte. « Voir » mène à la pièce en cause dans la supervision.
 */
function PastillePanne() {
  const alarms = useLive((s) => s.alarms);
  const machines = useProject((s) => s.machines);
  const surSupervision = useUi((s) => s.step === 6 && !s.vueOrganisation);
  const panne = useMemo(() => panneOuverte(alarms, machines), [alarms, machines]);
  // Sur la supervision, la panne est déjà sous les yeux : sa fiche, son verdict, la liste des alarmes.
  if (!panne || surSupervision) return null;
  return (
    <button
      type="button"
      className={`btn sm pastille-panne ${panne.exercice ? 'exercice' : ''}`}
      onClick={() => focusAlarm(panne.alarme.id)}
      title={`${panne.alarme.code} : ${panne.alarme.message}. Ouvre la supervision sur la pièce en cause.`}
    >
      <StatusIcon etat="panne" size={10} animate={false} />
      <span className="pastille-panne-txt">{panne.libelle}</span>
      <span className="pastille-panne-voir">· Voir</span>
    </button>
  );
}

export function TopBar() {
  const machines = useProject((s) => s.machines.length);
  const espace = useEspace();
  const assistantOuvert = useUi((s) => s.assistantOuvert);
  const configure = useProject((s) => s.configure);
  const logoEnHaut = useLogoEnHaut();

  return (
    <header className={`topbar ${espace}`}>
      {logoEnHaut && <LogoVoyageur className="topbar-logo" />}
      <button className="btn sm icon ghost topbar-menu" onClick={() => useCoquille.getState().setMenuOuvert(true)} aria-label="Ouvrir le menu : usines et écrans">
        <Menu />
      </button>
      <OuOnEst />
      <div className="spacer" />
      {espace === 'configuration' && (
        <span className="chip config-chip hide-sm" title="Vous modifiez l’usine. « Terminer la configuration » enregistre et revient à la supervision.">
          <LockOpen aria-hidden /> <span className="hide-md">Configuration ouverte</span>
        </span>
      )}
      <EtatEnregistrement />
      <Connexion />
      {espace === 'exploitation' ? (
        <>
          <PastillePanne />
          <button
            className="btn sm ask"
            aria-pressed={assistantOuvert}
            onClick={() => useUi.getState().setAssistantOuvert(!assistantOuvert)}
            title="Poser une question en français sur l’usine : pannes, maintenance, énergie. EVAN répond à partir de ses données."
            aria-label="Demander à EVAN"
          >
            {/* Tablette : un mot court plutôt qu'une icône seule, dont le title ne se lit pas au toucher. */}
            <MessageCircleQuestion aria-hidden /> <span className="lib-long">Demander à EVAN</span>
            <span className="lib-court hide-xs">Demander</span>
          </button>
          <button className="btn sm exercice" onClick={() => void simulateFault()} disabled={!machines || !configure} title={INFO_SIMULER} aria-label="Simuler une panne">
            <FlaskConical aria-hidden /> <span className="lib-long">Simuler une panne</span>
            <span className="lib-court hide-xs">Simuler</span>
          </button>
        </>
      ) : (
        // Bouton secondaire : l'action principale de chaque étape (« Suivant », puis « Terminer la configuration ») est
        // en bas du panneau, une seule en vermillon. Avant de finir, un avis dit ce qui manque (machines, branchements).
        <button
          className="btn sm"
          onClick={() => (stopTour(), void finishConfiguration())}
          title={configure ? 'Enregistrer la configuration et revenir à la supervision' : 'Terminer la configuration et ouvrir la supervision'}
          aria-label="Terminer la configuration"
        >
          <CheckCircle2 aria-hidden /> <span className="hide-md">Terminer la configuration</span>
          <span className="show-md">Terminer</span>
        </button>
      )}
    </header>
  );
}
