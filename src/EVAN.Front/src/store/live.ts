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
  t: number;
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
  pushToast(t: Omit<Toast, 'id' | 't'>): void;
  dismissToast(id: string): void;
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
    set({ toasts: [toast, ...get().toasts].slice(0, 4) });
    window.setTimeout(() => get().dismissToast(toast.id), t.gravite === 'critique' ? 12000 : 6000);
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
