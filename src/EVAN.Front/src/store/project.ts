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
import { borneNiveaux, niveauDe, niveauOccupeMax } from '@/domain/niveaux';
import { computeFrame, pointInPolygon, toLocal, type LngLat, type XY } from '@/geo/geodesy';
import { uid } from '@/sim/random';
import { useLive } from './live';

export type ProjectMode = 'demo' | 'assistant';

/** Zone d'un niveau qui contient un point du plan : rectangle englobant de son polygone, le même test qu'à la pose. */
export function zoneSous(zones: readonly Zone[], pos: XY, niveau = 0): Zone | undefined {
  return zones.find((z) => {
    if (niveauDe(z) !== niveau) return false;
    const xs = z.polygone.map((p) => p[0]);
    const ys = z.polygone.map((p) => p[1]);
    return pos[0] >= Math.min(...xs) && pos[0] <= Math.max(...xs) && pos[1] >= Math.min(...ys) && pos[1] <= Math.max(...ys);
  });
}

/**
 * Bâtiment qui contient un point du plan et qui a ce niveau ; à défaut, le premier qui a ce niveau, puis le premier
 * tout court (une machine ou une zone appartient toujours à un bâtiment).
 */
export function batimentSous(site: Site | null, batiments: readonly Batiment[], pos: XY, niveau = 0): Batiment | undefined {
  return batimentContenant(site, batiments, pos, niveau) ?? batiments.find((b) => borneNiveaux(b.niveaux) > niveau) ?? batiments[0];
}

/** Bâtiment dont le contour contient vraiment le point et qui a ce niveau ; rien si le point est dehors. */
export function batimentContenant(site: Site | null, batiments: readonly Batiment[], pos: XY, niveau = 0): Batiment | undefined {
  if (!site) return undefined;
  return batiments.find((b) => borneNiveaux(b.niveaux) > niveau && pointInPolygon(pos, b.contour.map((p) => toLocal(site.repere, p))));
}

/** Après une annulation : un bâtiment garde au moins les niveaux que ses zones et ses machines occupent. */
function tenirNiveaux(batiments: Batiment[], zones: readonly Zone[], machines: readonly Machine[]): Batiment[] {
  return batiments.map((b) => {
    const min = niveauOccupeMax(b.id, zones, machines) + 1;
    return borneNiveaux(b.niveaux) < min ? { ...b, niveaux: min } : b;
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

/**
 * Ce que l'annulation sait remettre : tout ce qu'on relève, trace, pose, branche et règle dans l'usine active. Le store
 * ne modifie jamais un objet en place (chaque action rend de nouveaux tableaux) : garder les références suffit.
 */
interface Snapshot {
  batiments: Batiment[];
  zones: Zone[];
  machines: Machine[];
  connexions: Record<string, Connexion>;
  perso: Record<string, Perso>;
}

/** Nombre d'états gardés pour l'annulation. */
const HISTORIQUE_MAX = 40;
/**
 * Des modifications du même objet qui se suivent de près (une machine qu'on glisse, un nom qu'on tape, un curseur de
 * hauteur) ne font qu'un pas d'annulation : sinon Ctrl+Z reprendrait une lettre ou un pixel à la fois.
 */
const FUSION_MS = 1200;

/**
 * Ce qu'un retrait a enlevé, avec la place de chaque élément dans sa liste : de quoi le remettre tel quel depuis l'avis
 * « Annuler », même si d'autres modifications ont suivi.
 */
export interface Retrait {
  batiments: { item: Batiment; index: number }[];
  zones: { item: Zone; index: number }[];
  machines: { item: Machine; index: number }[];
  connexions: Connexion[];
  perso: [Id, Perso][];
  /** Machines restées en place dont la zone a été retirée : elles la retrouvent à l'annulation. */
  zonesPerdues: [machineId: Id, zoneId: Id][];
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
  /** Retire un bâtiment avec ses zones et ses machines (rien ne reste orphelin) ; rend ce qui a été retiré. */
  removeBatiment(id: string): Retrait | undefined;
  setContour(id: string, contour: LngLat[], sigmas: number[]): void;
  /**
   * Garde l'état actuel pour l'annulation. Avec une clé, des appels rapprochés sur la même clé ne gardent que le premier
   * état (un glisser, une saisie au clavier).
   */
  pushHistory(cle?: string): void;
  undo(): void;
  redo(): void;
  /** Remet ce qu'un retrait avait enlevé (ce qui est déjà revenu, par Ctrl+Z par exemple, n'est pas doublé). */
  restaurer(r: Retrait): void;
  setHauteur(id: string, hauteur: number): void;
  /** Nombre de niveaux d'un bâtiment, jamais sous le dernier niveau qui porte une zone ou une machine. */
  setNiveaux(id: string, niveaux: number): void;
  addZone(z: Zone): void;
  updateZone(id: string, patch: Partial<Zone>): void;
  /** Retire une zone ; ses machines restent en place, sans zone. Rend ce qui a été retiré. */
  removeZone(id: string): Retrait | undefined;
  addMachine(m: Machine): void;
  updateMachine(id: string, patch: Partial<Machine>): void;
  /** Retire une machine avec sa connexion et ses réglages ; rend ce qui a été retiré. */
  removeMachine(id: string): Retrait | undefined;
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

// ---------- Historique et retraits ----------

const capture = (s: Pick<ProjectState, keyof Snapshot>): Snapshot => ({
  batiments: s.batiments,
  zones: s.zones,
  machines: s.machines,
  connexions: s.connexions,
  perso: s.perso,
});

/** Dernière clé de fusion de l'historique et son heure (hors du store : elles ne s'affichent nulle part). */
let derniereModif: { cle?: string; t: number } = { t: 0 };

const sans = <T>(obj: Record<string, T>, ids: ReadonlySet<string>): Record<string, T> =>
  Object.fromEntries(Object.entries(obj).filter(([k]) => !ids.has(k)));

/** Insère chaque élément à sa place d'origine (dans l'ordre des places), sans doubler ce qui est déjà là. */
function remettre<T extends { id: Id }>(liste: T[], items: { item: T; index: number }[]): T[] {
  const presents = new Set(liste.map((x) => x.id));
  return [...items]
    .sort((a, b) => a.index - b.index)
    .filter(({ item }) => !presents.has(item.id))
    .reduce((acc, { item, index }) => [...acc.slice(0, index), item, ...acc.slice(index)], liste);
}

/**
 * Retire des machines (et leur connexion, leurs réglages), des zones et des bâtiments d'un coup, en notant ce qui part.
 * Les machines d'une zone retirée qui, elles, restent perdent seulement leur zone.
 */
function retirer(s: ProjectState, ids: { batiments?: Id[]; zones?: Id[]; machines?: Id[] }): { patch: Partial<ProjectState>; retrait: Retrait } {
  const bIds = new Set(ids.batiments ?? []);
  const zIds = new Set(ids.zones ?? []);
  const mIds = new Set(ids.machines ?? []);
  const indexes = <T extends { id: Id }>(liste: T[], set: ReadonlySet<Id>) => liste.flatMap((item, index) => (set.has(item.id) ? [{ item, index }] : []));
  const zonesPerdues = s.machines.filter((m) => !mIds.has(m.id) && m.zoneId && zIds.has(m.zoneId)).map((m): [Id, Id] => [m.id, m.zoneId as Id]);
  const perdues = new Set(zonesPerdues.map(([m]) => m));
  const retrait: Retrait = {
    batiments: indexes(s.batiments, bIds),
    zones: indexes(s.zones, zIds),
    machines: indexes(s.machines, mIds),
    connexions: Object.values(s.connexions).filter((c) => mIds.has(c.machineId)),
    perso: Object.entries(s.perso).filter(([k]) => mIds.has(k)),
    zonesPerdues,
  };
  const patch: Partial<ProjectState> = {
    batiments: s.batiments.filter((b) => !bIds.has(b.id)),
    zones: s.zones.filter((z) => !zIds.has(z.id)),
    machines: s.machines.filter((m) => !mIds.has(m.id)).map((m) => (perdues.has(m.id) ? { ...m, zoneId: undefined } : m)),
    connexions: sans(s.connexions, mIds),
    perso: sans(s.perso, mIds),
  };
  return { patch, retrait };
}

const retraitVide = (r: Retrait) => !r.batiments.length && !r.zones.length && !r.machines.length;

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
    if (opts?.history !== false) get().pushHistory(`batiment:${b.id}`);
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
    const s = get();
    if (!s.batiments.some((b) => b.id === id)) return undefined;
    s.pushHistory();
    const { patch, retrait } = retirer(s, {
      batiments: [id],
      zones: s.zones.filter((z) => z.batimentId === id).map((z) => z.id),
      machines: s.machines.filter((m) => m.batimentId === id).map((m) => m.id),
    });
    set(patch);
    return retrait;
  },
  setContour: (id, contour, sigmas) => {
    set({ batiments: get().batiments.map((b) => (b.id === id ? { ...b, contour, sigmas } : b)) });
  },
  pushHistory: (cle) => {
    const t = Date.now();
    // Un historique vide (usine qui vient de s'ouvrir) garde toujours son premier état.
    const fusion = cle !== undefined && cle === derniereModif.cle && t - derniereModif.t < FUSION_MS && get().past.length > 0;
    derniereModif = { cle, t };
    if (fusion) return;
    set({ past: [...get().past.slice(-(HISTORIQUE_MAX - 1)), capture(get())], future: [] });
  },
  undo: () => {
    const past = get().past;
    if (!past.length) return;
    const prev = past[past.length - 1];
    // La modification suivante, même sur le même objet, fait un nouveau pas.
    derniereModif = { t: 0 };
    // Un niveau ajouté sans passer par l'historique, et déjà occupé, n'est pas repris.
    set({ ...prev, past: past.slice(0, -1), future: [capture(get()), ...get().future], batiments: tenirNiveaux(prev.batiments, prev.zones, prev.machines) });
  },
  redo: () => {
    const [next, ...rest] = get().future;
    if (!next) return;
    derniereModif = { t: 0 };
    set({ ...next, future: rest, past: [...get().past, capture(get())], batiments: tenirNiveaux(next.batiments, next.zones, next.machines) });
  },
  restaurer: (r) => {
    const s = get();
    const absente = (id: Id) => !s.machines.some((m) => m.id === id);
    const aRemettre: Retrait = { ...r, machines: r.machines.filter(({ item }) => absente(item.id)) };
    const zonesAbsentes = r.zones.filter(({ item }) => !s.zones.some((z) => z.id === item.id));
    const batimentsAbsents = r.batiments.filter(({ item }) => !s.batiments.some((b) => b.id === item.id));
    if (!aRemettre.machines.length && !zonesAbsentes.length && !batimentsAbsents.length) return;
    s.pushHistory();
    const remises = new Set(aRemettre.machines.map(({ item }) => item.id));
    const zoneRendue = new Map(r.zonesPerdues);
    const machines = remettre(s.machines, aRemettre.machines).map((m) => (!m.zoneId && zoneRendue.has(m.id) ? { ...m, zoneId: zoneRendue.get(m.id) } : m));
    set({
      batiments: remettre(s.batiments, batimentsAbsents),
      zones: remettre(s.zones, zonesAbsentes),
      machines,
      // Connexion et réglages ne reviennent qu'avec leur machine, et n'écrasent rien de plus récent.
      connexions: { ...Object.fromEntries(r.connexions.filter((c) => remises.has(c.machineId)).map((c) => [c.machineId, c])), ...s.connexions },
      perso: { ...Object.fromEntries(r.perso.filter(([k]) => remises.has(k))), ...s.perso },
    });
  },
  setHauteur: (id, hauteur) => {
    get().pushHistory(`hauteur:${id}`);
    set({ batiments: get().batiments.map((b) => (b.id === id ? { ...b, hauteur } : b)) });
  },
  setNiveaux: (id, niveaux) => {
    get().pushHistory(`niveaux:${id}`);
    const { batiments, zones, machines } = get();
    const n = Math.max(borneNiveaux(niveaux), niveauOccupeMax(id, zones, machines) + 1);
    set({ batiments: batiments.map((b) => (b.id === id ? { ...b, niveaux: n } : b)) });
  },
  addZone: (z) => {
    get().pushHistory();
    set({ zones: [...get().zones, z] });
  },
  updateZone: (id, patch) => {
    get().pushHistory(`zone:${id}:${Object.keys(patch).sort().join(',')}`);
    set({ zones: get().zones.map((z) => (z.id === id ? { ...z, ...patch } : z)) });
    // Une zone qui change de niveau emmène ses machines.
    if (patch.niveau !== undefined) set({ machines: get().machines.map((m) => (m.zoneId === id ? { ...m, niveau: patch.niveau } : m)) });
  },
  removeZone: (id) => {
    const s = get();
    if (!s.zones.some((z) => z.id === id)) return undefined;
    s.pushHistory();
    const { patch, retrait } = retirer(s, { zones: [id] });
    set(patch);
    return retrait;
  },
  addMachine: (m) => {
    get().pushHistory();
    set({ machines: [...get().machines, m] });
  },
  updateMachine: (id, patch) => {
    // Une machine déplacée, ou changée de niveau, prend la zone où elle arrive (et son bâtiment), sauf si le
    // changement la donne lui-même.
    const avant = get().machines.find((m) => m.id === id);
    if (!avant) return;
    get().pushHistory(`machine:${id}:${Object.keys(patch).sort().join(',')}`);
    const { zones, machines, site, batiments } = get();
    const bouge = (patch.position !== undefined || patch.niveau !== undefined) && !('zoneId' in patch);
    const pos = patch.position ?? avant.position;
    const niveau = patch.niveau ?? niveauDe(avant);
    const zone = bouge ? zoneSous(zones, pos, niveau) : undefined;
    // Sans zone : le bâtiment où elle se trouve ; dehors, elle garde le sien tant qu'il a ce niveau.
    const sien = batiments.find((b) => b.id === avant.batimentId && borneNiveaux(b.niveaux) > niveau);
    const batimentId = zone?.batimentId ?? batimentContenant(site, batiments, pos, niveau)?.id ?? sien?.id ?? batimentSous(site, batiments, pos, niveau)?.id ?? avant.batimentId;
    const suite = bouge ? { zoneId: zone?.id, batimentId } : {};
    set({ machines: machines.map((m) => (m.id === id ? { ...m, ...patch, ...suite } : m)) });
  },
  removeMachine: (id) => {
    const s = get();
    if (!s.machines.some((m) => m.id === id)) return undefined;
    s.pushHistory();
    const { patch, retrait } = retirer(s, { machines: [id] });
    set(patch);
    return retrait;
  },
  // Connexion et réglages d'une même machine enregistrés ensemble (« Enregistrer la connexion ») font un seul pas.
  setConnexion: (c) => {
    get().pushHistory(`reglages:${c.machineId}`);
    set({ connexions: { ...get().connexions, [c.machineId]: c } });
  },
  setPerso: (machineId, data) => {
    get().pushHistory(`reglages:${machineId}`);
    set({ perso: { ...get().perso, [machineId]: data } });
  },
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

/**
 * Une organisation à reprendre dans ce navigateur : il faut un contenu réel, un nom d'organisation ou une usine
 * localisée. Ouvrir l'assistant puis le quitter sans rien saisir enregistre une organisation vide, qui ne doit pas
 * faire proposer « Reprendre mon usine ».
 */
export function hasSavedAssistant(): boolean {
  const saved = readSaved();
  if (!saved) return false;
  const nom = saved.organisation?.nom;
  const usines = Array.isArray(saved.usines) ? saved.usines : [];
  return (typeof nom === 'string' && nom.trim().length > 0) || usines.some((u) => !!u?.site || !!u?.batiments?.length || !!u?.machines?.length);
}

/**
 * Annonce un retrait dans un avis qui propose « Annuler » pendant 10 s : l'avis remet exactement ce qui est parti.
 * Le même « Annuler » reste possible ensuite par Ctrl+Z.
 */
export function annoncerRetrait(r: Retrait | undefined, titre: string, texte?: string): void {
  if (!r || retraitVide(r)) return;
  useLive.getState().pushToast({ gravite: 'info', titre, texte, action: { libelle: 'Annuler', faire: () => useProject.getState().restaurer(r) } });
}

/** Nom court d'une machine dans un avis : son numéro, sinon son nom. */
const designation = (m: Machine) => m.numero.trim() || m.nom.trim() || 'Machine';

/**
 * Retire une machine et propose de l'annuler (« R01 retirée · Annuler »). C'est ce qu'appellent la corbeille de la
 * fiche, la liste des machines et la touche Suppr.
 */
export function retirerMachine(id: Id): void {
  const m = useProject.getState().machines.find((x) => x.id === id);
  if (!m) return;
  const r = useProject.getState().removeMachine(id);
  const branchee = r?.connexions.length ? ' Sa connexion part avec elle.' : '';
  annoncerRetrait(r, `${designation(m)} retirée`, `La machine a quitté le plan.${branchee}`);
}

/** Retire une zone et propose de l'annuler. Ses machines restent en place, sans zone. */
export function retirerZone(id: Id): void {
  const z = useProject.getState().zones.find((x) => x.id === id);
  if (!z) return;
  const r = useProject.getState().removeZone(id);
  const n = r?.zonesPerdues.length ?? 0;
  annoncerRetrait(r, `Zone « ${z.nom} » retirée`, n ? `${n > 1 ? `Ses ${n} machines restent` : 'Sa machine reste'} en place, sans zone.` : undefined);
}

/** Ce que contient un bâtiment : à dire avant de le retirer, puisque tout part avec lui. */
export function contenuBatiment(s: Pick<ProjectState, 'zones' | 'machines'>, id: Id): { zones: Zone[]; machines: Machine[] } {
  return { zones: s.zones.filter((z) => z.batimentId === id), machines: s.machines.filter((m) => m.batimentId === id) };
}

/** Retire un bâtiment avec ce qu'il contient et propose de l'annuler. */
export function retirerBatiment(id: Id): void {
  const b = useProject.getState().batiments.find((x) => x.id === id);
  if (!b) return;
  const r = useProject.getState().removeBatiment(id);
  const parts = [r?.zones.length && `${r.zones.length} zone${r.zones.length > 1 ? 's' : ''}`, r?.machines.length && `${r.machines.length} machine${r.machines.length > 1 ? 's' : ''}`].filter(Boolean);
  annoncerRetrait(r, `${b.nom} retiré`, parts.length ? `Avec ${parts.join(' et ')}.` : undefined);
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
