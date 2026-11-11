/**
 * Contenu de la page d'accueil : la presse du kit (presse flexo, la plus grande machine du parc) et les trois vues
 * qu'on peut lui demander. Peu de mots : c'est la presse qui montre, les étiquettes posées dessus nomment.
 */
import { Cog, Eye, TriangleAlert, type LucideIcon } from 'lucide-react';
import { MACHINE_TYPES, MODEL_FOOTPRINT } from '@/domain/catalog';

/** Vue de la presse : l'ensemble qui tourne, la panne provoquée, ou les pièces surveillées. */
export type VueId = 'accueil' | 'panne' | 'pieces';

export interface Vue {
  id: VueId;
  label: string;
  /** Libellé d'un écran étroit. */
  court: string;
  icon: LucideIcon;
}

export const PRESSE = MACHINE_TYPES.flexo;
const fp = MODEL_FOOTPRINT.flexo;
export const PRESSE_DIM = { w: fp.max[0] - fp.min[0], d: fp.max[1] - fp.min[1] };

const dorure = PRESSE.organes.find((o) => o.numero === 5)!;
/** Nom de la pièce en panne de la démonstration, repris par l'étiquette posée dessus. */
export const NOM_DORURE = dorure.nom;
/** Première vérification que le catalogue donne pour la casse du film (cause de la panne de l'organe 5). */
export const VERIF_DORURE = 'Contrôler le passage du film';
/** Code de l'alarme de la démonstration. */
export const CODE_PANNE = dorure.alarme?.code ?? 'CF-02';

/** Nom court d'une pièce, pour l'étiquette posée dessus : « Groupe flexo (servo direct) » devient « Groupe flexo ». */
export const nomCourt = (nom: string) => nom.split(/ \(| et /)[0];

/** Pièces surveillées de la presse, par numéro, avec leur nom court : la légende des numéros posés sur la presse. */
export const PIECES = PRESSE.organes
  .filter((o) => o.position)
  .map((o) => ({ numero: o.numero, nom: nomCourt(o.nom) }))
  .sort((a, b) => a.numero - b.numero);

/** Numéro d'une pièce tel qu'il est posé sur la presse : « 01 ». */
export const numeroPiece = (n: number) => String(n).padStart(2, '0');

const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * Ce qu'un lecteur d'écran entend quand on change de vue : la presse le montre en 3D, sans rien dire à qui ne la voit
 * pas. Les étiquettes posées sur la presse, elles, restent muettes (elles précéderaient le titre de la page).
 */
export function annonceVue(vue: VueId): string {
  if (vue === 'panne') {
    return `Panne ${CODE_PANNE} provoquée : la presse s’arrête. Pièce en cause : ${minuscule(NOM_DORURE)}. À vérifier : ${minuscule(VERIF_DORURE)}.`;
  }
  if (vue === 'pieces') return `Les ${PIECES.length} pièces surveillées : ${PIECES.map((p) => `${p.numero} ${p.nom}`).join(', ')}.`;
  return 'Vue d’ensemble : la presse tourne.';
}

/** Langages d'automate qu'EVAN sait lire (passerelle de l'atelier). */
export const PROTOCOLES = ['OPC UA', 'Modbus TCP', 'Siemens S7', 'MQTT', 'JDF/JMF'];

export const VUES: readonly Vue[] = [
  { id: 'accueil', label: 'Vue d’ensemble', court: 'Ensemble', icon: Eye },
  { id: 'panne', label: 'Provoquer une panne', court: 'Une panne', icon: TriangleAlert },
  { id: 'pieces', label: `Les ${PRESSE.organes.length} pièces`, court: 'Les pièces', icon: Cog },
];
