/**
 * La fiche d'un modèle dite en mots : chaque caractéristique du kit reçoit un intitulé qu'un chef d'atelier comprend,
 * et le niveau de fiabilité de la fiche est expliqué (définitions de data/kit/connaissances.md).
 */
import type { Niveau } from '@/store/live';

export const FIABILITE: Record<string, { mot: string; sens: string }> = {
  source_directe: {
    mot: 'Fiche constructeur',
    sens: 'Le modèle du kit est documenté par son constructeur : ses organes et ses caractéristiques en viennent. Votre machine peut être d’une autre marque ou d’une autre version.',
  },
  technologie_confirmee: {
    mot: 'Machine type',
    sens: 'Le procédé est connu, pas encore le modèle : les organes sont ceux d’une machine type, à ajuster au relevé sur place.',
  },
  deduit: {
    mot: 'À confirmer',
    sens: 'Machine supposée d’après les produits fabriqués : sa présence et son modèle sont à confirmer sur place.',
  },
};

const INTITULES: Record<string, string> = {
  Procédé: 'Comment elle travaille',
  Laize: 'Largeur de bande (laize)',
  Finition: 'Finition en ligne',
  Vitesse: 'Vitesse',
  Particularité: 'Ce qui la distingue',
  Nombre: 'Combien dans l’usine',
  Atout: 'Son atout',
  Rôle: 'Son rôle',
  'Enjeu SI': 'Pour le système d’information',
  Usage: 'À quoi elle sert',
  Données: 'Ce qu’on peut en tirer',
  Produits: 'Ce qu’elle fabrique',
  Logiciels: 'Logiciels',
};

/** Clé du kit qui liste ce qui reste à confirmer sur place : elle est affichée à part, comme une question ouverte. */
export const A_VERIFIER = 'À demander';

export function intitule(cle: string): string {
  return INTITULES[cle] ?? cle;
}

/** Combien de points de mesure d'une machine sont hors de leur plage normale en ce moment, par niveau. */
export function compterNiveaux(niveaux: (Niveau | undefined)[]): { attention: number; alarme: number } {
  return niveaux.reduce(
    (acc, n) => ({ attention: acc.attention + (n === 'attention' ? 1 : 0), alarme: acc.alarme + (n === 'alarme' ? 1 : 0) }),
    { attention: 0, alarme: 0 },
  );
}
