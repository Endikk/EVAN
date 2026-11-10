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

/** Langages d'automate qu'EVAN sait lire (passerelle de l'atelier). */
export const PROTOCOLES = ['OPC UA', 'Modbus TCP', 'Siemens S7', 'MQTT', 'JDF/JMF'];

export const VUES: readonly Vue[] = [
  { id: 'accueil', label: 'Vue d’ensemble', court: 'Ensemble', icon: Eye },
  { id: 'panne', label: 'Provoquer une panne', court: 'Une panne', icon: TriangleAlert },
  { id: 'pieces', label: `Les ${PRESSE.organes.length} pièces`, court: 'Les pièces', icon: Cog },
];
