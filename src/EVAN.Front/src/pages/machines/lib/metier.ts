/**
 * Ce que fait chaque machine du kit, en une phrase de métier, et la famille sous laquelle la ranger dans la
 * bibliothèque. Les phrases reprennent le rôle décrit par le kit (data/kit/machines.json), sans chiffre :
 * elles servent à reconnaître sa machine, pas à la spécifier.
 */
import { MACHINE_TYPES, MACHINE_TYPE_ORDER, MODEL_FOOTPRINT } from '@/domain/catalog';

export const PHRASE_METIER: Record<string, string> = {
  flexo: 'Imprime les étiquettes en continu sur bobine, avec des clichés souples.',
  offset: 'Imprime sur bobine avec des plaques, de l’encre et de l’eau de mouillage.',
  digital: 'Imprime sans plaque, en jet d’encre : petites séries et données variables.',
  ctp: 'Grave les plaques d’impression à partir des fichiers des clients.',
  slitter: 'Coupe la bobine imprimée en petites bobines, au métrage du client.',
  paravent: 'Perfore puis plie la bande en zigzag, pour les imprimantes en continu.',
  sheeter: 'Coupe la bobine en planches A4 ou A5, puis les empile.',
  rfid: 'Encode les puces RFID et imprime les données variables.',
};

/** Phrase de métier d'un type, ou son procédé quand le kit ne la donne pas. */
export function phraseMetier(type: string): string {
  return PHRASE_METIER[type] ?? MACHINE_TYPES[type]?.procede ?? 'Machine importée, hors du kit.';
}

/** Familles de la bibliothèque, dans l'ordre de passage d'une commande : on prépare, on imprime, on finit. */
const FAMILLES: { categorie: string; titre: string }[] = [
  { categorie: 'impression', titre: 'Imprimer' },
  { categorie: 'prepresse', titre: 'Préparer les plaques' },
  { categorie: 'faconnage', titre: 'Finir les étiquettes (façonnage)' },
  { categorie: 'atelier', titre: 'Encoder et personnaliser' },
];

export interface Famille {
  titre: string;
  types: string[];
}

/** Les types du kit rangés par famille ; une catégorie inconnue tombe dans « Autres machines ». */
export function famillesBibliotheque(): Famille[] {
  const connues = new Set(FAMILLES.map((f) => f.categorie));
  const familles = FAMILLES.map((f) => ({ titre: f.titre, types: MACHINE_TYPE_ORDER.filter((t) => MACHINE_TYPES[t].categorie === f.categorie) }));
  const autres = MACHINE_TYPE_ORDER.filter((t) => !connues.has(MACHINE_TYPES[t].categorie));
  return [...familles, { titre: 'Autres machines', types: autres }].filter((f) => f.types.length > 0);
}

const metres = (v: number) => v.toFixed(1).replace('.', ',');

/** Encombrement au sol d'un modèle du kit, « 8,3 × 2,3 m ». */
export function emprise(type: string): string {
  const fp = MODEL_FOOTPRINT[type] ?? MODEL_FOOTPRINT.custom;
  return `${metres(fp.max[0] - fp.min[0])} × ${metres(fp.max[1] - fp.min[1])} m`;
}
