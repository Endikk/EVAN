/**
 * Chargement de l'espace de travail : l'organisation (celle de la démo, celle du navigateur, ou celle du compte
 * connecté, lue sur le serveur), l'usine, puis l'écran à ouvrir d'après l'adresse (/demo/maintenance), un ancien lien
 * (/demo?ecran=maintenance) ou l'état de l'usine.
 */
import { useProject, resumeAssistant, hasSavedAssistant, type ProjectMode } from '@/store/project';
import { useUi, espaceOf, type Step } from '@/store/ui';
import { useCarnet } from '@/store/carnet';
import { initialiserEnregistrement } from '@/store/enregistrement';
import { useSession } from '@/store/session';
import { lireOrganisation } from '@/api/usine';
import { useMapUi } from '@/widgets/carte/mapState';
import { stopTour } from '@/widgets/tour/tour';
import { ecranDe, estConfiguration, type Ecran } from '@/widgets/shell/ecrans';

/** Paramètres lus au chargement, retirés ensuite de l'adresse : recharger la page ne doit pas les rejouer. */
export const PARAMS_LUS = ['nouveau', 'ecran'] as const;

/** Chapitre de départ de la visite : ?visite=8 démarre directement à la maintenance. */
function chapitreDepart(params: URLSearchParams) {
  const n = Number(params.get('visite'));
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

function chargerOrganisation(mode: ProjectMode, params: URLSearchParams, serveur: boolean) {
  const ui = useUi.getState();
  if (serveur) {
    // Organisation du compte, déjà relue sur le serveur. « Créer mon usine » en ajoute une sans rien effacer ; le
    // carnet saisi part vers le serveur et n'est pas gardé dans ce navigateur.
    if (params.get('nouveau')) useProject.getState().addUsine();
    useCarnet.setState({ saisies: [], persistant: false });
    ui.selectBatiment(useProject.getState().batiments[0]?.id);
  } else if (mode === 'demo') {
    useProject.getState().loadDemo();
    useCarnet.getState().charger('demo');
    // Lien direct vers une usine de la démo : /demo?usine=site-crissey
    const usine = params.get('usine');
    if (usine) useProject.getState().switchUsine(usine);
    ui.selectBatiment(useProject.getState().batiments[0]?.id);
  } else if (params.get('nouveau') || !hasSavedAssistant()) {
    useProject.getState().startAssistant();
    useCarnet.getState().vider();
    ui.selectBatiment(undefined);
  } else {
    resumeAssistant();
    useCarnet.getState().charger('assistant');
    ui.selectBatiment(useProject.getState().batiments[0]?.id);
  }
}

/**
 * Écran d'ouverture. Une usine configurée s'ouvre en exploitation : un écran de paramétrage demandé par l'adresse
 * passe par la fenêtre d'accès, comme depuis le bouton « Configurer ». Une usine en cours de paramétrage reprend
 * l'étape demandée si son bâtiment est relevé, l'étape 1 sinon. La visite guidée commence toujours par l'étape 1.
 */
function ecranOuverture(demande: Ecran | undefined, visite: boolean): { step: Step; organisation: boolean; acces: Step | null } {
  const { configure, site, batiments } = useProject.getState();
  if (visite) return { step: 1, organisation: false, acces: null };
  if (configure) {
    if (demande === 'organisation') return { step: 6, organisation: true, acces: null };
    if (demande !== undefined && espaceOf(demande) === 'exploitation') return { step: demande, organisation: false, acces: null };
    return { step: 6, organisation: false, acces: demande ?? null };
  }
  const releve = !!site && batiments.length > 0;
  return { step: demande !== undefined && estConfiguration(demande) && releve ? demande : 1, organisation: false, acces: null };
}

/**
 * Organisation du compte connecté, relue sur le serveur et posée dans le store. Faux sans compte ou sans serveur :
 * l'assistant garde alors son fonctionnement dans le navigateur. Lève ErreurApi si le serveur refuse ou ne répond pas.
 */
export async function chargerDepuisServeur(): Promise<boolean> {
  if ((await useSession.getState().verifier()) !== 'connecte') return false;
  const { organisation, usines } = await lireOrganisation();
  useProject.getState().chargerServeur(organisation, usines);
  initialiserEnregistrement();
  return true;
}

/**
 * Charge l'espace de travail et ouvre le bon écran. Renvoie le chapitre de visite guidée à lancer : la visite démarre
 * seule sur /demo, sauf ?visite=0, lien vers une autre usine (?usine=…) ou vers un écran précis. `serveur` : le store
 * porte déjà l'organisation du compte (chargerDepuisServeur).
 */
export function chargerEspace(mode: ProjectMode, ecranUrl: Ecran | undefined, params: URLSearchParams, serveur = false): number | null {
  stopTour();
  const ui = useUi.getState();
  ui.selectMachine(undefined);
  ui.selectZone(undefined);
  ui.setView('3d');
  ui.setVueOrganisation(false);
  ui.setReplay(null);
  useMapUi.getState().set({ mode: 'browse', editing: undefined, lastAddedId: undefined, detectError: undefined });
  chargerOrganisation(mode, params, serveur);

  const demande = ecranUrl ?? ecranDe(params.get('ecran') ?? '');
  const visite = mode === 'demo' && demande === undefined && params.get('visite') !== '0' && !params.get('usine') ? chapitreDepart(params) : null;
  const { step, organisation, acces } = ecranOuverture(demande, visite !== null);
  ui.setStep(step);
  ui.setVueOrganisation(organisation);
  ui.setAccessRequest(acces);
  // Organes et connexion se règlent machine par machine : la première est présélectionnée, comme en y naviguant.
  const premiere = useProject.getState().machines[0]?.id;
  if ((step === 4 || step === 5) && premiere) ui.selectMachine(premiere);
  ui.setFocus(step === 4 && premiere ? { kind: 'machine', machineId: premiere } : { kind: 'site' });
  return visite;
}
