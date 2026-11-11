/**
 * Où en est la configuration, étape par étape, calculé sur les tâches obligatoires de chaque écran : les mêmes que la
 * liste « À faire ici » de chaque panneau. Le rail des étapes, la barre de progression et les panneaux lisent ce même
 * calcul. Une étape est cochée parce que son travail est fait, pas parce qu'on l'a dépassée ; une étape commencée, ou
 * laissée derrière soi sans être finie, est « à reprendre ».
 *
 * Ce module garde aussi les coches propres à ce navigateur (contours et hauteurs regardés, organes relus), qui n'entrent
 * pas dans le modèle de l'usine, et la règle de numérotation des machines : les écrans de configuration les relisent
 * d'ici, et le rail (hors des écrans) peut les lire sans dépendre d'eux.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import type { Batiment, Connexion, Machine, Site, Zone } from '@/domain/types';
import { MACHINE_TYPES } from '@/domain/catalog';
import { useProject, type Perso, type ProjectMode } from './project';
import { useUi } from './ui';

// ---------- Coches de ce navigateur ----------

/** On ne garde que les derniers identifiants : un bâtiment ne sert plus une fois l'usine supprimée. */
const MAX_IDS = 300;

function lireIds(cle: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(cle) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface IdsMarques {
  ids: string[];
  marquer(id: string): void;
}

/** Une liste d'identifiants cochés, gardée dans ce navigateur (la coche tient le temps de la session si le stockage est bloqué). */
function storeIds(cle: string) {
  return create<IdsMarques>()((set, get) => ({
    ids: lireIds(cle),
    marquer: (id) => {
      if (get().ids.includes(id)) return;
      const ids = [...get().ids, id].slice(-MAX_IDS);
      set({ ids });
      try {
        localStorage.setItem(cle, JSON.stringify(ids));
      } catch {
        /* navigation privée : la coche tiendra le temps de la session */
      }
    },
  }));
}

/** Contours regardés et validés (« Le contour est juste », ou une correction faite). */
export const useContoursVerifies = storeIds('evan.verif.contours');

/** Hauteurs regardées : réglées au curseur, ou confirmées telles quelles. */
export const useHauteursVerifiees = storeIds('evan.verif.hauteurs');

const CLE_ORGANES = 'evan.organes.verifies';

type ParUsine = Record<string, string[]>;

function lireOrganes(): ParUsine {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE_ORGANES) ?? '{}');
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

/** Machines dont on a relu les organes, cochées une à une dans l'étape 4. */
export const useVerifications = create<Verifications>()((set, get) => ({
  parUsine: lireOrganes(),
  definir: (usineId, machines) => {
    const parUsine = { ...get().parUsine, [usineId]: machines };
    set({ parUsine });
    try {
      localStorage.setItem(CLE_ORGANES, JSON.stringify(parUsine));
    } catch {
      /* stockage bloqué : la coche vaut pour la session */
    }
  },
}));

/**
 * Machines vérifiées d'une usine : la liste cochée, ou toutes si l'usine est configurée et rien n'a été coché (quelqu'un
 * a validé sa configuration).
 */
export function machinesVerifiees(cochees: string[] | undefined, machines: string[], configure: boolean): Set<string> {
  if (cochees === undefined) return new Set(configure ? machines : []);
  const presentes = new Set(machines);
  return new Set(cochees.filter((id) => presentes.has(id)));
}

/** La liste après avoir coché ou décoché une machine. */
export function basculer(verifiees: Set<string>, machineId: string): string[] {
  return verifiees.has(machineId) ? [...verifiees].filter((id) => id !== machineId) : [...verifiees, machineId];
}

// ---------- Numérotation des machines ----------

/**
 * Où en est la pose des machines, calculé sur les machines réellement posées : le numéro est obligatoire et doit
 * être unique (c'est lui qu'on retrouve sur le plan et dans les alarmes), le nom est un confort pour l'atelier.
 */
export interface EtatPose {
  total: number;
  /** Numéros portés par plusieurs machines. */
  numerosEnDouble: string[];
  /** Machines sans numéro. */
  sansNumero: number;
  /** Noms portés par plusieurs machines, avec leur nombre, du plus fréquent au moins fréquent. */
  nomsEnDouble: { nom: string; n: number }[];
}

function doublons(valeurs: string[]): Map<string, number> {
  const compte = new Map<string, number>();
  for (const v of valeurs) compte.set(v, (compte.get(v) ?? 0) + 1);
  return new Map([...compte].filter(([, n]) => n > 1));
}

export function etatPose(machines: readonly Pick<Machine, 'numero' | 'nom'>[]): EtatPose {
  const numeros = machines.map((m) => m.numero.trim()).filter(Boolean);
  const noms = machines.map((m) => m.nom.trim()).filter(Boolean);
  return {
    total: machines.length,
    numerosEnDouble: [...doublons(numeros).keys()],
    sansNumero: machines.length - numeros.length,
    nomsEnDouble: [...doublons(noms)].map(([nom, n]) => ({ nom, n })).sort((a, b) => b.n - a.n),
  };
}

export const numerotationOk = (e: EtatPose) => e.total > 0 && e.sansNumero === 0 && e.numerosEnDouble.length === 0;

/** Ce qui manque à la numérotation, en une phrase, ou rien si elle est bonne. */
export function problemeNumeros(e: EtatPose): string | undefined {
  if (e.sansNumero > 0) return e.sansNumero === 1 ? 'Une machine n’a pas de numéro.' : `${e.sansNumero} machines n’ont pas de numéro.`;
  if (e.numerosEnDouble.length) return `Deux machines portent le numéro ${e.numerosEnDouble[0]}.`;
  return undefined;
}

// ---------- Tâches et état des étapes ----------

export type EtapeConfig = 1 | 2 | 3 | 4 | 5;
export const ETAPES_CONFIG: readonly EtapeConfig[] = [1, 2, 3, 4, 5];

/** Faite (tout l'obligatoire est coché), à reprendre (commencée, ou laissée derrière soi sans être finie), ou à faire. */
export type EtatEtape = 'faite' | 'a-reprendre' | 'a-faire';

export interface EntreeAvancement {
  mode: ProjectMode;
  site: Site | null;
  batiments: readonly Batiment[];
  zones: readonly Zone[];
  machines: readonly Machine[];
  connexions: Readonly<Record<string, Connexion>>;
  perso: Readonly<Record<string, Perso>>;
  configure: boolean;
  contoursVerifies: readonly string[];
  hauteursVerifiees: readonly string[];
  /** Machines cochées « vérifiées » à l'étape 4 pour cette usine, ou rien si personne n'a encore coché. */
  organesCoches: string[] | undefined;
}

/**
 * Les tâches obligatoires de chaque étape, nommées : les panneaux lisent la leur, le rail et la barre lisent le tout.
 * Une tâche qui ne se pose pas dans cette usine (aucune machine importée à décrire) vaut `undefined` : elle ne compte
 * ni comme faite ni comme à faire.
 */
export interface TachesConfig {
  1: { adresse: boolean; batiment: boolean; contours: boolean };
  2: { hauteurs: boolean; zone: boolean };
  3: { posees: boolean; numeros: boolean };
  4: { organesVerifies: boolean; importeesDecrites: boolean | undefined };
  5: { branchees: boolean };
}

/** Une machine est branchée quand sa connexion est enregistrée. */
export const estBranchee = (c?: Connexion) => c?.etat === 'connectee';

export function tachesConfig(e: EntreeAvancement): TachesConfig {
  // L'usine d'exemple est déjà relevée et vérifiée ; ailleurs, chaque contour et chaque hauteur doit avoir été regardé.
  const vu = (ids: readonly string[]) => (id: string) => e.mode === 'demo' || ids.includes(id);
  const contourVu = vu(e.contoursVerifies);
  const hauteurVue = vu(e.hauteursVerifiees);
  const avecBatiments = e.batiments.length > 0;
  const avecMachines = e.machines.length > 0;
  const verifiees = machinesVerifiees(
    e.organesCoches,
    e.machines.map((m) => m.id),
    e.configure,
  );
  const importees = e.machines.filter((m) => !MACHINE_TYPES[m.type]);
  return {
    1: { adresse: !!e.site, batiment: avecBatiments, contours: avecBatiments && e.batiments.every((b) => contourVu(b.id)) },
    2: { hauteurs: avecBatiments && e.batiments.every((b) => hauteurVue(b.id)), zone: e.zones.length > 0 },
    3: { posees: avecMachines, numeros: numerotationOk(etatPose(e.machines)) },
    4: {
      organesVerifies: avecMachines && e.machines.every((m) => verifiees.has(m.id)),
      importeesDecrites: importees.length ? importees.every((m) => (e.perso[m.id]?.organes.length ?? 0) > 0) : undefined,
    },
    5: { branchees: avecMachines && e.machines.every((m) => estBranchee(e.connexions[m.id])) },
  };
}

/** L'état de chaque étape, d'après ses tâches et l'étape où l'on se trouve. */
export function etatEtapes(taches: TachesConfig, etapeCourante: number): Record<EtapeConfig, EtatEtape> {
  const etat = (n: EtapeConfig): EtatEtape => {
    const faits = Object.values(taches[n]).filter((f): f is boolean => f !== undefined);
    if (faits.every(Boolean)) return 'faite';
    return faits.some(Boolean) || n < etapeCourante ? 'a-reprendre' : 'a-faire';
  };
  return { 1: etat(1), 2: etat(2), 3: etat(3), 4: etat(4), 5: etat(5) };
}

/** Ce qu'on lit pour dire où en est la configuration, abonné seulement à ce qui la change. */
function useEntree(): EntreeAvancement {
  const mode = useProject((s) => s.mode);
  const site = useProject((s) => s.site);
  const batiments = useProject((s) => s.batiments);
  const zones = useProject((s) => s.zones);
  const machines = useProject((s) => s.machines);
  const connexions = useProject((s) => s.connexions);
  const perso = useProject((s) => s.perso);
  const configure = useProject((s) => s.configure);
  const usineId = useProject((s) => s.activeId);
  const contoursVerifies = useContoursVerifies((s) => s.ids);
  const hauteursVerifiees = useHauteursVerifiees((s) => s.ids);
  const organesCoches = useVerifications((s) => s.parUsine[usineId]);
  return useMemo(
    () => ({ mode, site, batiments, zones, machines, connexions, perso, configure, contoursVerifies, hauteursVerifiees, organesCoches }),
    [mode, site, batiments, zones, machines, connexions, perso, configure, contoursVerifies, hauteursVerifiees, organesCoches],
  );
}

/** Les tâches obligatoires de chaque étape, pour l'usine active. */
export function useTachesConfig(): TachesConfig {
  const entree = useEntree();
  return useMemo(() => tachesConfig(entree), [entree]);
}

/** L'état des cinq étapes de configuration : ce que lisent le rail, la barre de progression et les panneaux. */
export function useAvancement(): Record<EtapeConfig, EtatEtape> {
  const taches = useTachesConfig();
  const step = useUi((s) => s.step);
  return useMemo(() => etatEtapes(taches, step), [taches, step]);
}
