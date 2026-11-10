import { create } from 'zustand';
import type { Alarme } from '@/domain/types';
import type { Saisie } from '@/analytics/maintenance';

/** Intervention à consigner, préremplie depuis l'écran d'origine (tâche du plan, panne résolue…). */
export type PreSaisie = Partial<Omit<Saisie, 'id'>>;

/** Les sept étapes du parcours : configuration (1 à 5), supervision (6), historique (7). */
export type EtapeParcours = 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** Écran affiché : une étape du parcours, ou un écran d'exploitation ajouté (8 = maintenance, 9 = énergie). */
export type Step = EtapeParcours | 8 | 9;
export type View = '3d' | '2d';

/**
 * Deux espaces : la configuration (étapes 1 à 5, derrière un accès explicite) et l'exploitation
 * (6 = supervision, 7 = historique, 8 = maintenance, 9 = énergie), qui est l'écran par défaut une fois l'usine configurée.
 */
export type Espace = 'configuration' | 'exploitation';
export const espaceOf = (step: Step): Espace => (step <= 5 ? 'configuration' : 'exploitation');

/** Écrans d'exploitation en pleine page : tableaux de bord sans plan ni panneau latéral. */
export const enPleinePage = (step: Step): boolean => step >= 7;

export type CameraFocus =
  | { kind: 'site' }
  | { kind: 'machine'; machineId: string }
  | { kind: 'organe'; machineId: string; organeId: string };

export interface UiState {
  step: Step;
  view: View;
  selectedMachineId?: string;
  selectedZoneId?: string;
  selectedBatimentId?: string;
  focus: CameraFocus;
  /** Incrémenté pour rejouer une transition de caméra vers le même focus. */
  focusNonce: number;
  /** Visite guidée : en cours ou en pause (légende gardée), chapitre affiché. */
  tour: { playing: boolean; caption?: string; sub?: string; chapitre?: number };
  reducedMotionUser: boolean | null;
  systemReducedMotion: boolean;
  theme: 'light' | 'dark' | 'system';
  placingType?: string;
  showLabels: boolean;
  /** Type de zone en cours de tracé sur le plan 2D. */
  zoneTool: import('@/domain/types').TypeZone | null;
  /** Demande d'accès à la configuration (fenêtre de confirmation). */
  accessRequest: Step | null;
  /** Fenêtre de renommage de l'organisation ouverte. */
  organisationEdit: boolean;
  /** Vue d'ensemble de l'organisation (toutes ses usines), par-dessus l'usine active. */
  vueOrganisation: boolean;
  /** Panne rejouée dans la fenêtre « Revoir la panne ». */
  replay: Alarme | null;
  /** Panneau « Demander à EVAN » ouvert. */
  assistantOuvert: boolean;
  /** Machine présélectionnée à l'ouverture d'un écran d'exploitation (carnet, énergie). */
  pageMachineId?: string;
  /** Machine dont la supervision affiche l'outil de diagnostic d'un défaut répétitif. */
  diagnosticMachineId?: string;
  /** Fenêtre « Consigner une intervention » ouverte. */
  saisie: PreSaisie | null;

  setStep(step: Step): void;
  setView(v: View): void;
  selectMachine(id?: string): void;
  selectZone(id?: string): void;
  selectBatiment(id?: string): void;
  setFocus(f: CameraFocus): void;
  setTour(t: Partial<UiState['tour']>): void;
  setTheme(t: UiState['theme']): void;
  setReducedMotionUser(v: boolean | null): void;
  setPlacingType(t?: string): void;
  setShowLabels(v: boolean): void;
  setZoneTool(t: UiState['zoneTool']): void;
  setAccessRequest(s: Step | null): void;
  setOrganisationEdit(v: boolean): void;
  setVueOrganisation(v: boolean): void;
  setReplay(a: Alarme | null): void;
  setAssistantOuvert(v: boolean): void;
  setPageMachineId(id?: string): void;
  setDiagnosticMachineId(id?: string): void;
  setSaisie(s: PreSaisie | null): void;
}

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Barre du navigateur sur mobile (meta theme-color) : le fond de chaque thème, --bg dans app.css. */
const BARRE_NAVIGATEUR = { light: '#f4f3f1', dark: '#040812' } as const;

/** La barre suit le thème effectif : la nuit tant que le jour n'est pas choisi. */
function teinterBarre(theme: UiState['theme']) {
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BARRE_NAVIGATEUR[theme === 'light' ? 'light' : 'dark']);
}

function initialTheme(): UiState['theme'] {
  try {
    const t = localStorage.getItem('evan.theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

export const useUi = create<UiState>()((set, get) => ({
  step: 1,
  view: '3d',
  focus: { kind: 'site' },
  focusNonce: 0,
  tour: { playing: false },
  reducedMotionUser: null,
  systemReducedMotion: mq?.matches ?? false,
  theme: initialTheme(),
  showLabels: true,
  zoneTool: null,
  accessRequest: null,
  organisationEdit: false,
  vueOrganisation: false,
  replay: null,
  assistantOuvert: false,
  saisie: null,

  setStep: (step) => set({ step }),
  setView: (view) => set({ view }),
  selectMachine: (selectedMachineId) => set({ selectedMachineId }),
  selectZone: (selectedZoneId) => set({ selectedZoneId }),
  selectBatiment: (selectedBatimentId) => set({ selectedBatimentId }),
  setFocus: (focus) => set({ focus, focusNonce: get().focusNonce + 1 }),
  setTour: (t) => set({ tour: { ...get().tour, ...t } }),
  setTheme: (theme) => {
    try {
      if (theme === 'system') localStorage.removeItem('evan.theme');
      else localStorage.setItem('evan.theme', theme);
    } catch {
      /* ignore */
    }
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    teinterBarre(theme);
    set({ theme });
  },
  setReducedMotionUser: (reducedMotionUser) => set({ reducedMotionUser }),
  setPlacingType: (placingType) => set({ placingType }),
  setShowLabels: (showLabels) => set({ showLabels }),
  setZoneTool: (zoneTool) => set({ zoneTool }),
  setAccessRequest: (accessRequest) => set({ accessRequest }),
  setOrganisationEdit: (organisationEdit) => set({ organisationEdit }),
  setVueOrganisation: (vueOrganisation) => set({ vueOrganisation }),
  setReplay: (replay) => set({ replay }),
  setAssistantOuvert: (assistantOuvert) => set({ assistantOuvert }),
  setPageMachineId: (pageMachineId) => set({ pageMachineId }),
  setDiagnosticMachineId: (diagnosticMachineId) => set({ diagnosticMachineId }),
  setSaisie: (saisie) => set({ saisie }),
}));

export function useEspace(): Espace {
  return useUi((s) => espaceOf(s.step));
}

mq?.addEventListener('change', (e) => useUi.setState({ systemReducedMotion: e.matches }));
// index.html pose le thème avant le premier rendu ; la barre du navigateur le rejoint au chargement de l'application.
if (typeof document !== 'undefined') teinterBarre(useUi.getState().theme);

/** Animations réduites : préférence système, sauf choix explicite dans l'interface. */
export function useReducedMotion(): boolean {
  return useUi((s) => (s.reducedMotionUser ?? s.systemReducedMotion));
}

export function isReducedMotion(): boolean {
  const s = useUi.getState();
  return s.reducedMotionUser ?? s.systemReducedMotion;
}

/** Thème effectif : la nuit par défaut, le jour seulement sur choix explicite. */
export function useIsDark(): boolean {
  return useUi((s) => s.theme !== 'light');
}
