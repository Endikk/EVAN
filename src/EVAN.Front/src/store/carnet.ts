/**
 * Carnet de maintenance : interventions consignées à l'écran (bons de travail clos). Le reste du carnet (curatives,
 * préventives du plan, échéances) se déduit de l'historique et du plan, voir src/analytics/maintenance.ts.
 *
 * Démo : le carnet repart vide à chaque visite. Assistant : il est gardé dans le navigateur avec l'organisation.
 * Avec le back, chaque saisie part aussi vers EVAN.Api, où l'assistant et le serveur MCP la retrouvent.
 */
import { create } from 'zustand';
import type { Saisie } from '@/analytics/maintenance';
import { uid } from '@/sim/random';

const STORAGE_KEY = 'evan.carnet.v1';

interface CarnetState {
  /** Saisies de toute l'organisation (les identifiants de machine y sont uniques). */
  saisies: Saisie[];
  persistant: boolean;
  charger(mode: 'demo' | 'assistant'): void;
  /** Nouvelle organisation : carnet vide. */
  vider(): void;
  ajouter(s: Omit<Saisie, 'id'>): Saisie;
}

function lire(): Saisie[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Saisie[];
  } catch {
    return [];
  }
}

export const useCarnet = create<CarnetState>()((set, get) => ({
  saisies: [],
  persistant: false,
  charger: (mode) => set({ saisies: mode === 'assistant' ? lire() : [], persistant: mode === 'assistant' }),
  vider: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({ saisies: [], persistant: true });
  },
  ajouter: (s) => {
    const saisie = { ...s, id: uid('sa') };
    const saisies = [saisie, ...get().saisies];
    set({ saisies });
    if (get().persistant) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saisies));
      } catch {
        /* stockage plein ou bloqué : la saisie reste pour la session */
      }
    }
    return saisie;
  },
}));
