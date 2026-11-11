/**
 * Carnet de maintenance : interventions consignées à l'écran (bons de travail clos) et interventions planifiées, pas
 * encore faites. Le reste du carnet (curatives, préventives du plan, échéances) se déduit de l'historique et du plan,
 * voir src/analytics/maintenance.ts.
 *
 * Une intervention planifiée n'entre pas au journal : elle attend son jour dans « À faire », se déplace ou s'annule,
 * et ne devient une saisie qu'une fois consignée.
 *
 * Démo : le carnet repart vide à chaque visite. Assistant : il est gardé dans le navigateur avec l'organisation.
 * Avec le back, tout part aussi vers EVAN.Api, où l'assistant et le serveur MCP retrouvent le même carnet : chaque
 * saisie (logIntervention de la source), sa correction, sa suppression, et les interventions planifiées (getSource().carnet).
 */
import { create } from 'zustand';
import type { Prevue, Saisie } from '@/analytics/maintenance';
import { getSource } from '@/realtime/source';
import { uid } from '@/sim/random';

const STORAGE_KEY = 'evan.carnet.v1';
const STORAGE_PREVUES = 'evan.carnet.prevues.v1';

interface CarnetState {
  /** Saisies de toute l'organisation (les identifiants de machine y sont uniques). */
  saisies: Saisie[];
  /** Interventions planifiées, de toute l'organisation. */
  prevues: Prevue[];
  persistant: boolean;
  /** Saisie en cours de correction dans le bon de travail (identifiant), le temps que le bon est ouvert. */
  enCorrection: string | null;
  charger(mode: 'demo' | 'assistant'): void;
  /** Nouvelle organisation : carnet vide. */
  vider(): void;
  ajouter(s: Omit<Saisie, 'id'>): Saisie;
  /** Remet une saisie retirée à l'identique (« Annuler » d'une suppression). */
  restaurer(s: Saisie): void;
  /** Retire une saisie (« Annuler » juste après l'avoir consignée, « Supprimer » dans le journal). */
  retirer(id: string): Saisie | undefined;
  /** Remplace une saisie par sa version corrigée (même identifiant). */
  corriger(id: string, s: Omit<Saisie, 'id'>): Saisie | undefined;
  setEnCorrection(id: string | null): void;
  planifier(p: Omit<Prevue, 'id'> & { id?: string }): Prevue;
  deplacer(id: string, date: number): void;
  annulerPrevue(id: string): Prevue | undefined;
  /**
   * Le jour venu, l'intervention planifiée devient une saisie du carnet en un geste : elle quitte « À faire » et entre
   * au journal. Rend la saisie et l'intervention planifiée, pour pouvoir annuler.
   */
  consignerPrevue(id: string, now: number): { saisie: Saisie; prevue: Prevue } | undefined;
}

function lire<T>(cle: string): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(cle) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function ecrire(cle: string, valeur: unknown[]) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* stockage plein ou bloqué : le carnet reste pour la session */
  }
}

/**
 * Début d'une intervention planifiée consignée : l'heure prévue si elle est passée (le travail s'est fait comme
 * prévu), sinon maintenant moins sa durée, pour qu'elle ne finisse pas dans le futur.
 */
export function debutConsigne(p: Pick<Prevue, 'date' | 'duree'>, now: number): number {
  const auPlusTard = now - p.duree * 60_000;
  return p.date <= auPlusTard ? p.date : auPlusTard;
}

/** Carnet du serveur quand la source est l'API d'EVAN ; rien avec le simulateur local. */
const distant = () => getSource()?.carnet;

export const useCarnet = create<CarnetState>()((set, get) => {
  /** Applique un changement et le garde dans le navigateur quand le carnet est persistant (assistant). */
  const majSaisies = (saisies: Saisie[]) => {
    set({ saisies });
    if (get().persistant) ecrire(STORAGE_KEY, saisies);
  };
  const majPrevues = (prevues: Prevue[]) => {
    set({ prevues });
    if (get().persistant) ecrire(STORAGE_PREVUES, prevues);
  };

  return {
    saisies: [],
    prevues: [],
    persistant: false,
    enCorrection: null,
    charger: (mode) =>
      set({
        saisies: mode === 'assistant' ? lire<Saisie>(STORAGE_KEY) : [],
        prevues: mode === 'assistant' ? lire<Prevue>(STORAGE_PREVUES) : [],
        persistant: mode === 'assistant',
        enCorrection: null,
      }),
    vider: () => {
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_PREVUES);
      } catch {
        /* ignore */
      }
      set({ saisies: [], prevues: [], persistant: true, enCorrection: null });
    },
    ajouter: (s) => {
      const saisie = { ...s, id: uid('sa') };
      majSaisies([saisie, ...get().saisies]);
      return saisie;
    },
    restaurer: (s) => {
      if (get().saisies.some((x) => x.id === s.id)) return;
      majSaisies([s, ...get().saisies]);
      distant()?.restaurer(s);
    },
    retirer: (id) => {
      const s = get().saisies.find((x) => x.id === id);
      if (s) {
        majSaisies(get().saisies.filter((x) => x.id !== id));
        distant()?.supprimer(id);
      }
      return s;
    },
    corriger: (id, s) => {
      if (!get().saisies.some((x) => x.id === id)) return undefined;
      const corrigee = { ...s, id };
      majSaisies(get().saisies.map((x) => (x.id === id ? corrigee : x)));
      distant()?.corriger(corrigee);
      return corrigee;
    },
    setEnCorrection: (enCorrection) => set({ enCorrection }),
    planifier: ({ id, ...p }) => {
      const prevue = { ...p, id: id ?? uid('pv') };
      majPrevues([...get().prevues.filter((x) => x.id !== prevue.id), prevue]);
      distant()?.planifier(prevue);
      return prevue;
    },
    deplacer: (id, date) => {
      const p = get().prevues.find((x) => x.id === id);
      if (!p) return;
      const deplacee = { ...p, date };
      majPrevues(get().prevues.map((x) => (x.id === id ? deplacee : x)));
      distant()?.planifier(deplacee);
    },
    annulerPrevue: (id) => {
      const p = get().prevues.find((x) => x.id === id);
      if (p) {
        majPrevues(get().prevues.filter((x) => x.id !== id));
        distant()?.annulerPrevue(id);
      }
      return p;
    },
    consignerPrevue: (id, now) => {
      const prevue = get().prevues.find((x) => x.id === id);
      if (!prevue) return undefined;
      const saisie = get().ajouter({
        machineId: prevue.machineId,
        organeId: prevue.organeId,
        type: 'preventive',
        date: debutConsigne(prevue, now),
        duree: prevue.duree,
        titre: prevue.titre,
        auteur: prevue.auteur || 'Maintenance',
        tacheId: prevue.tacheId,
      });
      majPrevues(get().prevues.filter((x) => x.id !== id));
      // La saisie part au serveur avec logIntervention (actions.ts) ; l'intervention planifiée, elle, y est retirée.
      distant()?.annulerPrevue(id);
      return { saisie, prevue };
    },
  };
});
