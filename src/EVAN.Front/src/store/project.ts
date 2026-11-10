/**
 * Projet en cours d'édition : une organisation et ses usines (une ou plusieurs).
 *
 * L'usine active est « dépliée » à la racine du store (site, bâtiments, zones, machines, connexions) : c'est ce que lisent
 * tous les écrans, qui n'ont pas à savoir qu'il existe d'autres usines. Les autres attendent dans `usines` ; changer
 * d'usine range l'active à sa place et déplie la suivante.
 *
 * Mode « demo » : organisation d'exemple (Valtiq, deux usines) rechargée à chaque visite.
 * Mode « assistant » : l'organisation de l'utilisateur. Sans compte, sauvegardée dans ce navigateur ; avec un compte,
 * chargée depuis le serveur et enregistrée côté serveur (`serveur`), jamais recopiée dans le navigateur.
 */
import { create } from 'zustand';
import demoJson from '@data/demo.json';
import type { Batiment, Connexion, Id, Machine, Organe, Organisation, PointDeMesure, Site, Zone } from '@/domain/types';
import { computeFrame, type LngLat, type XY } from '@/geo/geodesy';
import { uid } from '@/sim/random';

export type ProjectMode = 'demo' | 'assistant';

/** Zone qui contient un point du plan : rectangle englobant de son polygone, le même test qu'à la pose. */
export function zoneSous(zones: readonly Zone[], pos: XY): Zone | undefined {
  return zones.find((z) => {
    const xs = z.polygone.map((p) => p[0]);
    const ys = z.polygone.map((p) => p[1]);
    return pos[0] >= Math.min(...xs) && pos[0] <= Math.max(...xs) && pos[1] >= Math.min(...ys) && pos[1] <= Math.max(...ys);
  });
}

/** Organes et points saisis à la main pour une machine (modèle importé ou seuils modifiés). */
export interface Perso {
  organes: Organe[];
  points: PointDeMesure[];
}

/** Une usine de l'organisation : son site et tout ce qu'on y a relevé, placé et connecté. */
export interface Usine {
  id: Id;
  /** Absent tant que l'adresse n'est pas trouvée (nouvelle usine) ; son identifiant est celui de l'usine. */
  site: Site | null;
  batiments: Batiment[];
  zones: Zone[];
  machines: Machine[];
  connexions: Record<string, Connexion>;
  /** Organes et points saisis à la main (modèles personnalisés ou surcharges). */
  perso: Record<string, Perso>;
  /** Configuration terminée : l'usine s'ouvre sur la supervision, la configuration passe derrière un accès. */
  configure: boolean;
}

interface Snapshot {
  batiments: Batiment[];
}

export interface ProjectState extends Omit<Usine, 'id'> {
  mode: ProjectMode;
  /** Organisation d'un compte connecté, chargée depuis le serveur : rien n'en est gardé dans le navigateur. */
  serveur: boolean;
  organisation: Organisation;
  /** Toutes les usines, dans l'ordre d'affichage. L'entrée de l'usine active n'est à jour qu'une fois rangée : lire `listUsines`. */
  usines: Usine[];
  /** Usine active, dépliée dans les champs hérités d'`Usine`. */
  activeId: Id;
  /** Modèles glTF importés : url blob → nom de fichier. */
  modelesImportes: { url: string; nom: string }[];
  past: Snapshot[];
  future: Snapshot[];

  loadDemo(): void;
  startAssistant(): void;
  /** Organisation et usines d'un compte, relues du serveur ; une organisation sans usine en reçoit une vide. */
  chargerServeur(organisation: Organisation, usines: Usine[]): void;
  setOrganisationNom(nom: string): void;
  /** Range l'usine active et déplie celle demandée (une usine laissée vide n'est pas conservée). */
  switchUsine(id: Id): void;
  /** Ajoute une usine vide et la rend active ; renvoie son identifiant. */
  addUsine(): Id;
  setSite(site: Site): void;
  setRepere(origin: LngLat, angleDeg: number): void;
  upsertBatiment(b: Batiment, opts?: { history?: boolean }): void;
  removeBatiment(id: string): void;
  setContour(id: string, contour: LngLat[], sigmas: number[]): void;
  pushHistory(): void;
  undo(): void;
  redo(): void;
  setHauteur(id: string, hauteur: number): void;
  addZone(z: Zone): void;
  updateZone(id: string, patch: Partial<Zone>): void;
  removeZone(id: string): void;
  addMachine(m: Machine): void;
  updateMachine(id: string, patch: Partial<Machine>): void;
  removeMachine(id: string): void;
  setConnexion(c: Connexion): void;
  setPerso(machineId: string, data: Perso): void;
  addModeleImporte(m: { url: string; nom: string }): void;
  setConfigure(v: boolean): void;
}

// ---------- Usines ----------

export function emptyUsine(id: Id = uid('site')): Usine {
  return { id, site: null, batiments: [], zones: [], machines: [], connexions: {}, perso: {}, configure: false };
}

const isEmpty = (u: Usine) => !u.site && !u.batiments.length && !u.machines.length;

/** L'usine active telle qu'elle est en ce moment (champs dépliés, éventuellement modifiés). */
function foldActive(s: ProjectState): Usine {
  const { activeId: id, site, batiments, zones, machines, connexions, perso, configure } = s;
  return { id, site, batiments, zones, machines, connexions, perso, configure };
}

/** Toutes les usines de l'organisation, l'active comprise et à jour. */
export function listUsines(s: ProjectState): Usine[] {
  return s.usines.map((u) => (u.id === s.activeId ? foldActive(s) : u));
}

/** Champs du store pour travailler sur une usine (historique d'annulation propre à chaque usine). */
function unfold(u: Usine) {
  return {
    activeId: u.id,
    site: u.site,
    batiments: u.batiments,
    zones: u.zones,
    machines: u.machines,
    connexions: u.connexions,
    perso: u.perso,
    configure: u.configure,
    past: [] as Snapshot[],
    future: [] as Snapshot[],
  };
}

// ---------- Démo ----------

type DemoUsine = Pick<Usine, 'batiments' | 'zones' | 'machines'> & { site: Site };

const demo = demoJson as unknown as { organisation: Organisation; usines: DemoUsine[] };

/** Connexions de démonstration : JMF pour la presse flexo, OPC UA chiffré pour les autres ; un sous-réseau par usine. */
function demoConnexions(machines: Machine[], reseau: string): Record<string, Connexion> {
  return Object.fromEntries(
    machines.map((m, i) => [
      m.id,
      {
        id: `cx-${m.id}`,
        machineId: m.id,
        protocole: m.type === 'flexo' ? 'jmf' : 'opcua',
        parametres: (m.type === 'flexo'
          ? { url: `http://${reseau}.11:8080/jmf`, intervalle: '5000' }
          : {
              endpoint: `opc.tcp://${reseau}.${20 + i}:4840`,
              securite: 'SignAndEncrypt',
              politique: 'Basic256Sha256',
              auth: 'Certificat X.509',
              publication: '250',
            }) as Record<string, string>,
        etat: 'connectee',
        associations: {},
        lectureSeule: true,
      } satisfies Connexion,
    ]),
  );
}

function demoState() {
  const usines: Usine[] = demo.usines.map((u, i) => ({
    id: u.site.id,
    site: structuredClone(u.site),
    batiments: structuredClone(u.batiments),
    zones: structuredClone(u.zones),
    machines: structuredClone(u.machines),
    connexions: demoConnexions(u.machines, `10.${20 + 10 * i}.1`),
    perso: {},
    configure: true,
  }));
  return { mode: 'demo' as const, serveur: false, organisation: structuredClone(demo.organisation), usines, modelesImportes: [], ...unfold(usines[0]) };
}

// ---------- Assistant et sauvegarde locale ----------

const STORAGE_KEY = 'evan.assistant.v2';
/** Format d'avant le multi-usines (une seule usine à la racine), repris comme première usine. */
const LEGACY_KEY = 'evan.assistant.v1';

interface Saved {
  organisation: Organisation;
  activeId: Id;
  usines: Usine[];
}

/** Organisation sans nom : l'assistant le demande avant de commencer. */
function emptyAssistant() {
  const usine = emptyUsine();
  return { mode: 'assistant' as const, serveur: false, organisation: { id: 'org-moi', nom: '' }, usines: [usine], modelesImportes: [], ...unfold(usine) };
}

function readSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Saved;
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return null;
    const v1 = JSON.parse(legacy) as Partial<Usine> & { organisation?: Organisation };
    const usine: Usine = { ...emptyUsine(v1.site?.id), ...v1 };
    delete (usine as Partial<Saved>).organisation;
    return { organisation: v1.organisation ?? { id: 'org-moi', nom: '' }, activeId: usine.id, usines: [usine] };
  } catch {
    return null;
  }
}

/** Efface l'organisation enregistrée dans ce navigateur (sauvegarde illisible ou d'un ancien format). */
export function clearSavedAssistant() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* stockage bloqué : rien à effacer */
  }
}

function loadAssistant() {
  const saved = readSaved();
  if (!Array.isArray(saved?.usines) || !saved.usines.length) return emptyAssistant();
  const usines = saved.usines.map((u) => ({ ...emptyUsine(u.id), ...u }));
  const active = usines.find((u) => u.id === saved.activeId) ?? usines[0];
  return { mode: 'assistant' as const, serveur: false, organisation: saved.organisation, usines, modelesImportes: [], ...unfold(active) };
}

function saveAssistant(s: ProjectState) {
  try {
    // Les modèles importés (adresses blob:) ne survivent pas au rechargement : leurs machines ne sont pas gardées.
    const usines = listUsines(s).map((u) => ({ ...u, machines: u.machines.filter((m) => !m.modele.url.startsWith('blob:')) }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ organisation: s.organisation, activeId: s.activeId, usines } satisfies Saved));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* quota ou stockage bloqué : la session continue sans sauvegarde */
  }
}

// ---------- Store ----------

export const useProject = create<ProjectState>()((set, get) => ({
  ...demoState(),

  loadDemo: () => set(demoState()),
  startAssistant: () => {
    clearSavedAssistant();
    set(emptyAssistant());
  },
  chargerServeur: (organisation, usines) => {
    const liste = usines.length ? usines : [emptyUsine()];
    set({ mode: 'assistant', serveur: true, organisation, usines: liste, modelesImportes: [], ...unfold(liste[0]) });
  },
  setOrganisationNom: (nom) => set({ organisation: { ...get().organisation, nom: nom.trim() } }),
  switchUsine: (id) => {
    const s = get();
    const target = s.usines.find((u) => u.id === id);
    if (!target || id === s.activeId) return;
    const usines = listUsines(s).filter((u) => u.id === id || !isEmpty(u));
    set({ usines, ...unfold(target) });
  },
  addUsine: () => {
    const s = get();
    // L'usine active est encore vide : c'est elle, la nouvelle usine.
    if (isEmpty(foldActive(s))) return s.activeId;
    const usine = emptyUsine();
    set({ usines: [...listUsines(s), usine], ...unfold(usine) });
    return usine.id;
  },
  // Le site prend l'identifiant de l'usine active : bâtiments, sujets MQTT et flux temps réel s'y rattachent.
  setSite: (site) => set({ site: { ...site, id: get().activeId, organisationId: get().organisation.id } }),
  setRepere: (origin, angleDeg) => {
    const site = get().site;
    if (site) set({ site: { ...site, repere: { origin, angleDeg } } });
  },
  upsertBatiment: (b, opts) => {
    if (opts?.history !== false) get().pushHistory();
    const list = get().batiments;
    const i = list.findIndex((x) => x.id === b.id);
    const batiments = i >= 0 ? list.map((x) => (x.id === b.id ? b : x)) : [...list, b];
    set({ batiments });
    // Le repère du site suit le premier bâtiment tant qu'aucune machine n'est placée.
    const site = get().site;
    if (site && batiments[0] && get().machines.length === 0 && get().zones.length === 0) {
      const repere = computeFrame(batiments[0].contour);
      // Le premier bâtiment retenu fait foi pour la position du site (le point SIRENE peut être décalé).
      set({ site: { ...site, repere, coordonnees: i < 0 && batiments.length === 1 ? repere.origin : site.coordonnees } });
    }
  },
  removeBatiment: (id) => {
    get().pushHistory();
    set({ batiments: get().batiments.filter((b) => b.id !== id) });
  },
  setContour: (id, contour, sigmas) => {
    set({ batiments: get().batiments.map((b) => (b.id === id ? { ...b, contour, sigmas } : b)) });
  },
  pushHistory: () => set({ past: [...get().past.slice(-40), { batiments: structuredClone(get().batiments) }], future: [] }),
  undo: () => {
    const past = get().past;
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ past: past.slice(0, -1), future: [{ batiments: structuredClone(get().batiments) }, ...get().future], batiments: prev.batiments });
  },
  redo: () => {
    const [next, ...rest] = get().future;
    if (!next) return;
    set({ future: rest, past: [...get().past, { batiments: structuredClone(get().batiments) }], batiments: next.batiments });
  },
  setHauteur: (id, hauteur) => set({ batiments: get().batiments.map((b) => (b.id === id ? { ...b, hauteur } : b)) }),
  addZone: (z) => set({ zones: [...get().zones, z] }),
  updateZone: (id, patch) => set({ zones: get().zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) }),
  removeZone: (id) => set({ zones: get().zones.filter((z) => z.id !== id) }),
  addMachine: (m) => set({ machines: [...get().machines, m] }),
  updateMachine: (id, patch) => {
    // Une machine déplacée prend la zone où elle arrive (et son bâtiment), sauf si le changement la donne lui-même.
    const { zones } = get();
    const zone = patch.position && !('zoneId' in patch) ? zoneSous(zones, patch.position) : undefined;
    const suite = patch.position && !('zoneId' in patch) ? { zoneId: zone?.id, ...(zone ? { batimentId: zone.batimentId } : {}) } : {};
    set({ machines: get().machines.map((m) => (m.id === id ? { ...m, ...patch, ...suite } : m)) });
  },
  removeMachine: (id) => set({ machines: get().machines.filter((m) => m.id !== id) }),
  setConnexion: (c) => set({ connexions: { ...get().connexions, [c.machineId]: c } }),
  setPerso: (machineId, data) => set({ perso: { ...get().perso, [machineId]: data } }),
  addModeleImporte: (m) => set({ modelesImportes: [...get().modelesImportes, m] }),
  setConfigure: (configure) => set({ configure }),
}));

// Sauvegarde locale de l'organisation de l'utilisateur (mode assistant sans compte uniquement : celle d'un compte reste
// sur le serveur, et un poste partagé n'en garde aucune copie après la déconnexion).
let saveTimer: ReturnType<typeof setTimeout> | undefined;
useProject.subscribe((s) => {
  if (s.mode !== 'assistant' || s.serveur) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveAssistant(s), 400);
});

export function resumeAssistant() {
  useProject.setState(loadAssistant());
}

export function hasSavedAssistant(): boolean {
  try {
    return !!(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY));
  } catch {
    return false;
  }
}

/** Centre et taille du site dans le repère local (pour cadrer la caméra). */
export function siteBounds(points: XY[]): { center: XY; size: XY } {
  if (!points.length) return { center: [0, 0], size: [40, 40] };
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { center: [(minX + maxX) / 2, (minZ + maxZ) / 2], size: [maxX - minX, maxZ - minZ] };
}
