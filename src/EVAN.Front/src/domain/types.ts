/**
 * Modèle de données EVAN (miroir des entités du back : src/EVAN.Core/Domain).
 * Organisation › Site (une ou plusieurs usines) › Bâtiment › Zone › Machine › Organe › PointDeMesure,
 * plus Connexion, Alarme et Événement.
 */
import type { Frame, LngLat, XY } from '@/geo/geodesy';

export type Id = string;

export interface Organisation {
  id: Id;
  nom: string;
}

export interface Site {
  id: Id;
  organisationId: Id;
  nom: string;
  adresse: string;
  /** Point d'adresse (géocodage ou SIRENE). */
  coordonnees: LngLat;
  /** Repère local commun aux bâtiments, zones et machines du site. */
  repere: Frame;
  siret?: string;
  /** Passerelle edge de l'usine (une par site, connexion sortante vers le broker). */
  passerelle?: string;
  /** Surface annoncée par l'entreprise (m²), point de comparaison du relevé. */
  surfaceAnnoncee?: number;
}

export type SourceEmprise = 'bdtopo' | 'osm' | 'manuel' | 'demo';

export interface Batiment {
  id: Id;
  siteId: Id;
  nom: string;
  /** Contour ouvert (sans point de fermeture), en lon/lat WGS84. */
  contour: LngLat[];
  /** Écart-type de position de chaque sommet, en mètres (par coordonnée). */
  sigmas: number[];
  hauteur: number;
  niveaux: number;
  source: SourceEmprise;
  sourceRef?: string;
  rnb?: string;
  usage?: string;
  /** Précision planimétrique annoncée par la source (m). */
  precisionSource?: number;
}

export type TypeZone = 'atelier' | 'stock' | 'expedition' | 'prepresse' | 'faconnage' | 'bureaux';

export interface Zone {
  id: Id;
  batimentId: Id;
  nom: string;
  type: TypeZone;
  /** Polygone dans le repère local du site (mètres). */
  polygone: XY[];
}

export interface Machine {
  id: Id;
  batimentId: Id;
  zoneId?: Id;
  /** Type du catalogue (flexo, offset…) ou « custom ». */
  type: string;
  nom: string;
  numero: string;
  /** Position au sol dans le repère local du site (mètres). */
  position: XY;
  rotationDeg: number;
  modele: { url: string; personnalise?: boolean };
  /** Date d'ajout (machines placées dans l'assistant) ; absente pour l'usine d'exemple. */
  creeLe?: number;
}

export type TypeMesure =
  | 'tension'
  | 'temperature'
  | 'vitesse'
  | 'pression'
  | 'alarme'
  | 'ph'
  | 'conductivite'
  | 'viscosite'
  | 'puissance'
  | 'reperage'
  | 'comptage'
  | 'taux'
  | 'diametre'
  | 'couple'
  | 'densite'
  | 'longueur'
  | 'usure';

export interface Seuils {
  alarmeBas?: number;
  attentionBas?: number;
  attentionHaut?: number;
  alarmeHaut?: number;
}

export interface PointDeMesure {
  id: Id;
  machineId: Id;
  organeId: Id;
  cle: string;
  libelle: string;
  type: TypeMesure;
  unite: string;
  nominal: number;
  seuils: Seuils;
  /** Protocole et adresse une fois la variable associée (étape 5). */
  protocole?: Protocole;
  adresse?: string;
}

export interface Organe {
  id: Id;
  machineId: Id;
  numero: number;
  nom: string;
  /** Nom du nœud dans le modèle 3D (diag_N_nom) et sa position locale. */
  noeud3d?: string;
  position?: [number, number, number];
  capteurs: string[];
  pannesTypiques: string[];
  methode?: string;
  alarme?: { code: string; message: string };
}

export type Protocole = 'opcua' | 'modbus' | 's7' | 'jmf' | 'mqtt' | 'simulateur';

export type EtatConnexion = 'a_configurer' | 'test' | 'connectee' | 'erreur';

export interface Connexion {
  id: Id;
  machineId: Id;
  protocole: Protocole;
  parametres: Record<string, string>;
  etat: EtatConnexion;
  derniereErreur?: string;
  /** Variable remontée → point de mesure. */
  associations: Record<string, Id>;
  lectureSeule: boolean;
}

export type Gravite = 'info' | 'attention' | 'critique';
export type StatutAlarme = 'active' | 'acquittee' | 'resolue';
export type RegleAlarme = 'seuil' | 'derive' | 'repetitif' | 'automate';

export interface Alarme {
  id: Id;
  code: string;
  message: string;
  gravite: Gravite;
  machineId: Id;
  organeId: Id;
  pointId?: Id;
  horodatage: number;
  valeur?: number;
  unite?: string;
  seuil?: number;
  statut: StatutAlarme;
  regle: RegleAlarme;
  cause?: string;
  finLe?: number;
  acquitteePar?: string;
  /** Heure de l'acquittement : du déclenchement à la prise en compte (temps moyen d'acquittement). */
  acquitteeLe?: number;
  repetitions?: number;
}

export type TypeEvenement = 'etat' | 'alarme' | 'action' | 'connexion' | 'systeme';

export interface Evenement {
  id: Id;
  type: TypeEvenement;
  horodatage: number;
  machineId?: Id;
  message: string;
  auteur?: string;
}

/** États machine lisibles d'un coup d'œil (couleur + forme + animation). */
export type EtatMachine = 'marche' | 'attention' | 'panne' | 'arret' | 'calage';
