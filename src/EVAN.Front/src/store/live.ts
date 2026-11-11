/**
 * État temps réel : états machine, dernières valeurs, alarmes, événements, trace de détection.
 * Alimenté soit par le simulateur du navigateur, soit par le hub SignalR du back.
 */
import { create } from 'zustand';
import type { Alarme, EtatMachine, Evenement } from '@/domain/types';

export type Niveau = 'ok' | 'attention' | 'alarme';

export interface MachineLive {
  etat: EtatMachine;
  vitesse: number;
  /** Vitesse rapportée à la nominale (0..1+), pilote les animations 3D. */
  facteur: number;
  depuis: number;
  bonnes: number;
  gache: number;
  message?: string;
  /** Plus aucune donnée de la machine (passerelle ou automate injoignable) : l'état affiché est le dernier connu. */
  horsLigne?: boolean;
}

export interface PointLive {
  v: number;
  t: number;
  niveau: Niveau;
}

export type EtapeTrace =
  | 'defaut'
  | 'capteur'
  | 'automate'
  | 'passerelle'
  | 'mqtt'
  | 'ingestion'
  | 'regles'
  | 'alarme'
  | 'signalr'
  | 'ecran';

export interface TraceStep {
  etape: EtapeTrace;
  libelle: string;
  detail?: string;
  t: number;
}

export interface DetectionTrace {
  id: string;
  machineId: string;
  organeId: string;
  code?: string;
  debut: number;
  steps: TraceStep[];
  termine: boolean;
  simule: boolean;
  /** De l'échantillon hors seuil d'alarme jusqu'à l'affichage (ms). */
  latence?: number;
}

export interface Toast {
  id: string;
  gravite: 'info' | 'attention' | 'critique' | 'succes';
  titre: string;
  texte?: string;
  alarmeId?: string;
  /** L'alarme de l'avis vient d'une panne d'exercice. */
  exercice?: boolean;
  /**
   * Action proposée dans l'avis, en plus de « Fermer » : « Annuler » après une suppression ou une clôture,
   * « Consigner l'intervention » après une réparation. L'avis se ferme une fois l'action faite.
   */
  action?: ToastAction;
  /** Durée d'affichage (ms) ; par défaut 12 s pour un avis critique, 6 s sinon, 10 s s'il porte une action. */
  duree?: number;
  t: number;
}

export interface ToastAction {
  libelle: string;
  faire: () => void;
}

export type SourceKind = 'local' | 'api';

interface LiveState {
  source: SourceKind;
  connected: boolean;
  /** Réception de la dernière donnée (horloge du navigateur) : un flux ouvert mais muet se voit. */
  lastDataAt?: number;
  tick: number;
  machines: Record<string, MachineLive>;
  values: Record<string, PointLive>;
  alarms: Alarme[];
  events: Evenement[];
  trace?: DetectionTrace;
  toasts: Toast[];
  /** Pousse un avis et rend son identifiant. Un avis sur la même alarme remplace le précédent, comme celui d'une
   *  alarme du même titre : une mesure « à surveiller » qui s'aggrave en panne devient une nouvelle alarme (autre
   *  identifiant, même code et même machine) et ne doit pas s'empiler en deux avis presque identiques. */
  pushToast(t: Omit<Toast, 'id' | 't'>): string;
  dismissToast(id: string): void;
}

/** Deux avis d'alarme parlent de la même chose : même alarme, ou même titre (code et machine) après une escalade. */
function memeAlarme(a: Pick<Toast, 'alarmeId' | 'titre'>, b: Pick<Toast, 'alarmeId' | 'titre'>): boolean {
  if (!a.alarmeId || !b.alarmeId) return false;
  return a.alarmeId === b.alarmeId || a.titre === b.titre;
}

export const useLive = create<LiveState>()((set, get) => ({
  source: 'local',
  connected: false,
  tick: 0,
  machines: {},
  values: {},
  alarms: [],
  events: [],
  toasts: [],
  pushToast: (t) => {
    const toast = { ...t, id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, t: Date.now() };
    const autres = t.alarmeId ? get().toasts.filter((x) => !memeAlarme(x, t)) : get().toasts;
    set({ toasts: [toast, ...autres].slice(0, 4) });
    const duree = t.duree ?? (t.action ? 10000 : t.gravite === 'critique' ? 12000 : 6000);
    setTimeout(() => get().dismissToast(toast.id), duree);
    return toast.id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));

/** Séries courtes (10 min à 1 Hz) hors du store React pour éviter des copies à chaque seconde. */
const SERIES_MAX = 900;
const series = new Map<string, { t: number[]; v: number[] }>();

export function pushSample(pointId: string, t: number, v: number) {
  let s = series.get(pointId);
  if (!s) {
    s = { t: [], v: [] };
    series.set(pointId, s);
  }
  s.t.push(t);
  s.v.push(v);
  if (s.t.length > SERIES_MAX) {
    s.t.splice(0, s.t.length - SERIES_MAX);
    s.v.splice(0, s.v.length - SERIES_MAX);
  }
}

export function getSeries(pointId: string): { t: number[]; v: number[] } {
  return series.get(pointId) ?? { t: [], v: [] };
}

export function clearSeries() {
  series.clear();
}

export function activeAlarmsOf(alarms: Alarme[], machineId: string) {
  return alarms.filter((a) => a.machineId === machineId && a.statut !== 'resolue');
}
