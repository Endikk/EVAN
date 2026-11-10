/**
 * Machines dont on a relu les organes, cochées une à une dans l'étape 4. C'est une aide au parcours, propre à ce
 * navigateur : elle n'entre pas dans le modèle de l'usine. Une usine déjà configurée compte toutes ses machines comme
 * vérifiées tant que personne n'a rien décoché : quelqu'un a validé sa configuration.
 */
import { create } from 'zustand';

const CLE = 'evan.organes.verifies';

type ParUsine = Record<string, string[]>;

function lire(): ParUsine {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE) ?? '{}');
    if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return {};
    return Object.fromEntries(
      Object.entries(brut as Record<string, unknown>)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => [k, (v as unknown[]).filter((x): x is string => typeof x === 'string')]),
    );
  } catch {
    return {};
  }
}

interface Verifications {
  parUsine: ParUsine;
  definir(usineId: string, machines: string[]): void;
}

export const useVerifications = create<Verifications>()((set, get) => ({
  parUsine: lire(),
  definir: (usineId, machines) => {
    const parUsine = { ...get().parUsine, [usineId]: machines };
    set({ parUsine });
    try {
      localStorage.setItem(CLE, JSON.stringify(parUsine));
    } catch {
      /* stockage bloqué : la coche vaut pour la session */
    }
  },
}));

/** Machines vérifiées d'une usine : la liste cochée, ou toutes si l'usine est configurée et rien n'a été coché. */
export function machinesVerifiees(cochees: string[] | undefined, machines: string[], configure: boolean): Set<string> {
  if (cochees === undefined) return new Set(configure ? machines : []);
  const presentes = new Set(machines);
  return new Set(cochees.filter((id) => presentes.has(id)));
}

/** La liste après avoir coché ou décoché une machine. */
export function basculer(verifiees: Set<string>, machineId: string): string[] {
  return verifiees.has(machineId) ? [...verifiees].filter((id) => id !== machineId) : [...verifiees, machineId];
}
