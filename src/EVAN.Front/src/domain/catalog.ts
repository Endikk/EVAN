/**
 * Catalogue machines : fusion du kit fourni (data/kit/machines.json : organes, positions 3D,
 * pannes typiques, méthode de diagnostic) et de l'enrichissement EVAN (data/catalog.json :
 * points de mesure, seuils, forme de panne, cause probable et intervention, cylindres, puissance par état,
 * plan de maintenance).
 */
import kitJson from '@data/kit/machines.json';
import catalogJson from '@data/catalog.json';
import type { Machine, Organe, PointDeMesure, Seuils, TypeMesure } from './types';

export interface MesureDef {
  cle: string;
  libelle: string;
  type: TypeMesure;
  unite: string;
  nominal: number;
  bruit: number;
  seuils: Seuils;
  dynamique?: 'decroit' | 'croit' | 'compteur';
  role?: 'vitesse' | 'alarmes';
}

export interface PanneDef {
  mesure: string;
  forme: 'rampe' | 'saut' | 'oscillation';
  cible: number;
  duree: number;
  cause: string;
  /** Intervention type qui remet la machine en état (compte rendu du carnet de maintenance). */
  action?: string;
  lie?: Record<string, number>;
}

/** Aspect d'un défaut imprimé sur la bande, qui oriente vers une famille de pièces tournantes. */
export type NatureDefaut = 'impression' | 'decoupe' | 'marque' | 'dorure';

/** Pièce tournante d'un organe : son diamètre ou son développement (circonférence), en mm. */
export interface CylindreDef {
  nom: string;
  nature: NatureDefaut;
  diametre?: number;
  developpement?: number;
}

export interface OrganeDef {
  numero: number;
  nom: string;
  position?: [number, number, number];
  capteurs: string[];
  pannesTypiques: string[];
  methode?: string;
  connexion?: string;
  alarme?: { code: string; message: string };
  mesures: MesureDef[];
  panne?: PanneDef;
  cylindres: CylindreDef[];
}

/** Puissance électrique appelée par état de la machine (kW). */
export interface ProfilEnergie {
  marche: number;
  calage: number;
  panne: number;
  arret: number;
}

/**
 * Tâche du plan de maintenance (NF EN 13306) : systématique, à intervalle d'heures de marche (h) ou de jours (j),
 * ou conditionnelle, déclenchée par les seuils d'un point de mesure d'usure.
 */
export interface TacheDef {
  id: string;
  organe: number;
  tache: string;
  nature: 'systematique' | 'conditionnelle';
  intervalle?: number;
  unite?: 'h' | 'j';
  /** Clé du point de mesure suivi (maintenance conditionnelle). */
  point?: string;
  /** Durée d'intervention prévue (min). */
  duree: number;
}

export interface TypeMachineDef {
  id: string;
  libelle: string;
  nomKit: string;
  procede: string;
  description: string;
  fiabilite: { niveau: string; libelle: string };
  caracteristiques: Record<string, string>;
  connectivite: { pilotage_et_protocoles: string; donnees_a_recuperer: string; localiser_une_panne: string };
  modele: string;
  prefixe: string;
  categorie: string;
  vitesse: { nominale: number; max: number; unite: string };
  energie: ProfilEnergie;
  maintenance: TacheDef[];
  organes: OrganeDef[];
}

interface KitPoint {
  numero: number;
  nom: string;
  position?: [number, number, number];
  capteurs_donnees: string[];
  pannes_typiques: string[];
  remonter_a_la_cause?: string;
  se_connecter?: string;
  alarme_simulee?: { code: string; message: string } | null;
}

interface KitMachine {
  id: string;
  nom: string;
  procede: string;
  description: string;
  fiabilite: { niveau: string; libelle: string };
  caracteristiques: Record<string, string>;
  connectivite: TypeMachineDef['connectivite'];
  modele_3d?: { fichier: string };
  points_diagnostic?: KitPoint[];
}

interface CatalogType {
  libelle: string;
  prefixe: string;
  categorie: string;
  vitesse: TypeMachineDef['vitesse'];
  energie: ProfilEnergie;
  maintenance?: TacheDef[];
  organes: Record<string, { mesures: MesureDef[]; panne?: PanneDef; cylindres?: CylindreDef[] }>;
}

/** Paramètres énergétiques par défaut : facteur d'émission (kgCO₂e/kWh) et prix (€/kWh), avec leur source. */
export interface ParametresEnergie {
  facteurCo2: number;
  sourceCo2: string;
  prixKwh: number;
  sourcePrix: string;
}

const kit = kitJson as unknown as { machines: KitMachine[]; animation: { pas_etiquette_m: number } };
const catalog = catalogJson as unknown as { types: Record<string, CatalogType>; energie: ParametresEnergie };

/** Pas d'étiquette du kit (m) : convertit les mètres de bande en étiquettes. */
export const PAS_ETIQUETTE_M = kit.animation.pas_etiquette_m;

export const ENERGIE_DEFAUT: ParametresEnergie = catalog.energie;

/** Profil d'une machine importée hors catalogue. */
const ENERGIE_INCONNUE: ProfilEnergie = { marche: 10, calage: 5, panne: 3, arret: 0.5 };

export const MACHINE_TYPES: Record<string, TypeMachineDef> = Object.fromEntries(
  kit.machines
    .filter((m) => catalog.types[m.id])
    .map((m) => {
      const c = catalog.types[m.id];
      const organes: OrganeDef[] = (m.points_diagnostic ?? []).map((p) => {
        const e = c.organes[String(p.numero)] ?? { mesures: [] };
        return {
          numero: p.numero,
          nom: p.nom,
          position: p.position,
          capteurs: p.capteurs_donnees,
          pannesTypiques: p.pannes_typiques,
          methode: p.remonter_a_la_cause,
          connexion: p.se_connecter,
          alarme: p.alarme_simulee ?? undefined,
          mesures: e.mesures,
          panne: e.panne,
          cylindres: e.cylindres ?? [],
        };
      });
      const def: TypeMachineDef = {
        id: m.id,
        libelle: c.libelle,
        nomKit: m.nom,
        procede: m.procede,
        description: m.description,
        fiabilite: m.fiabilite,
        caracteristiques: m.caracteristiques,
        connectivite: m.connectivite,
        modele: `/kit/${m.modele_3d?.fichier ?? `modeles/${m.id}.glb`}`,
        prefixe: c.prefixe,
        categorie: c.categorie,
        vitesse: c.vitesse,
        energie: c.energie,
        maintenance: c.maintenance ?? [],
        organes,
      };
      return [m.id, def];
    }),
);

/** Puissance appelée par état pour un type de machine (profil générique pour une machine importée). */
export function profilEnergie(type: string): ProfilEnergie {
  return MACHINE_TYPES[type]?.energie ?? ENERGIE_INCONNUE;
}

export const MACHINE_TYPE_ORDER = ['flexo', 'offset', 'digital', 'ctp', 'slitter', 'paravent', 'sheeter', 'rfid'].filter(
  (id) => MACHINE_TYPES[id],
);

/** Empreinte au sol des modèles du kit (m), mesurée sur les fichiers glb, socle compris. */
export const MODEL_FOOTPRINT: Record<string, { min: [number, number]; max: [number, number]; h: number }> = {
  flexo: { min: [-4.25, -1], max: [4.1, 1.3], h: 2.02 },
  offset: { min: [-4, -1], max: [3.6, 1.25], h: 2.42 },
  ctp: { min: [-2.2, -0.85], max: [3.4, 2.13], h: 1.6 },
  digital: { min: [-3.15, -0.9], max: [2.65, 1.25], h: 1.89 },
  slitter: { min: [-1.75, -0.85], max: [2.45, 1.15], h: 2.18 },
  paravent: { min: [-3, -0.9], max: [1.75, 1.25], h: 1.69 },
  sheeter: { min: [-2.55, -0.8], max: [2.05, 1.1], h: 1.52 },
  rfid: { min: [-1.5, -0.75], max: [1.65, 1], h: 1.72 },
  custom: { min: [-1.5, -1], max: [1.5, 1], h: 2 },
};

export const organeId = (machineId: string, numero: number) => `${machineId}.o${numero}`;
export const pointId = (machineId: string, numero: number, cle: string) => `${machineId}.o${numero}.${cle}`;

export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/** Nom du nœud de diagnostic dans le glb (diag_N_nom). */
export const diagNodeName = (o: { numero: number; nom: string }) => `diag_${o.numero}_${slug(o.nom)}`;

/** Adresse OPC UA proposée par défaut pour un point (convention de nommage de la passerelle). */
export function defaultNodeId(machine: Machine, organe: { numero: number; nom: string }, cle: string) {
  return `ns=2;s=${machine.numero}.${slug(organe.nom)}.${cle}`;
}

export interface MachineModel {
  type?: TypeMachineDef;
  organes: Organe[];
  points: PointDeMesure[];
  /** Définitions brutes par organe (mesures, panne). */
  defs: Record<string, OrganeDef>;
  vitessePointId?: string;
}

const cache = new Map<string, MachineModel>();

/**
 * Organes et points de mesure d'une machine, dérivés de son type. Les saisies de l'utilisateur
 * (organes d'un modèle importé, seuils modifiés) remplacent les valeurs du catalogue.
 */
export function machineModel(machine: Machine, perso?: { organes: Organe[]; points: PointDeMesure[] }): MachineModel {
  const base = baseModel(machine);
  if (!perso) return base;
  return {
    ...base,
    organes: perso.organes.length ? perso.organes : base.organes,
    points: perso.points.length ? perso.points : base.points,
  };
}

function baseModel(machine: Machine): MachineModel {
  const key = `${machine.id}|${machine.type}|${machine.numero}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const type = MACHINE_TYPES[machine.type];
  const organes: Organe[] = [];
  const points: PointDeMesure[] = [];
  const defs: Record<string, OrganeDef> = {};
  let vitessePointId: string | undefined;
  for (const o of type?.organes ?? []) {
    const oid = organeId(machine.id, o.numero);
    defs[oid] = o;
    organes.push({
      id: oid,
      machineId: machine.id,
      numero: o.numero,
      nom: o.nom,
      noeud3d: diagNodeName(o),
      position: o.position,
      capteurs: o.capteurs,
      pannesTypiques: o.pannesTypiques,
      methode: o.methode,
      alarme: o.alarme,
    });
    for (const m of o.mesures) {
      const pid = pointId(machine.id, o.numero, m.cle);
      if (m.role === 'vitesse' && !vitessePointId) vitessePointId = pid;
      points.push({
        id: pid,
        machineId: machine.id,
        organeId: oid,
        cle: m.cle,
        libelle: m.libelle,
        type: m.type,
        unite: m.unite,
        nominal: m.nominal,
        seuils: m.seuils,
        protocole: 'opcua',
        adresse: defaultNodeId(machine, o, m.cle),
      });
    }
  }
  const model = { type, organes, points, defs, vitessePointId };
  cache.set(key, model);
  return model;
}

export const TYPE_MESURE_LIBELLE: Record<TypeMesure, string> = {
  tension: 'Tension',
  temperature: 'Température',
  vitesse: 'Vitesse',
  pression: 'Pression',
  alarme: 'Alarme',
  ph: 'pH',
  conductivite: 'Conductivité',
  viscosite: 'Viscosité',
  puissance: 'Puissance',
  reperage: 'Repérage',
  comptage: 'Comptage',
  taux: 'Taux',
  diametre: 'Diamètre',
  couple: 'Couple',
  densite: 'Densité',
  longueur: 'Longueur',
  usure: 'Usure',
};
