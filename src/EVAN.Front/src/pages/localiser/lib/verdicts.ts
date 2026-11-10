/**
 * Ce que l'écran « Localiser » dit en clair, calculé à partir de l'état réel : quel conseil afficher sur la carte,
 * et comment lire l'écart entre la surface relevée et celle que l'entreprise annonce.
 */
import { formatArea, formatNumber } from '@/geo/geodesy';

/** Le conseil affiché sur la carte, selon où en est l'utilisateur. `null` : rien à dire, la carte reste libre. */
export type PhaseAccueil = 'adresse' | 'cherche' | 'choisir' | 'cliquer' | 'releve' | 'erreur' | 'dessin' | null;

export interface EtatAccueil {
  aSite: boolean;
  nbBatiments: number;
  dessin: boolean;
  /** Recherche des bâtiments de l'adresse en cours. */
  cherche: boolean;
  /** Relevé du contour d'un bâtiment cliqué en cours. */
  releve: boolean;
  nbCandidats: number;
  erreur: boolean;
  /** L'utilisateur tape dans la barre de recherche : sa liste de résultats passe devant. */
  saisie: boolean;
}

export function phaseAccueil(e: EtatAccueil): PhaseAccueil {
  if (e.dessin) return 'dessin';
  if (e.nbBatiments > 0) return null;
  if (e.releve) return 'releve';
  if (e.cherche) return 'cherche';
  if (e.saisie) return null;
  if (e.erreur) return 'erreur';
  if (!e.aSite) return 'adresse';
  return e.nbCandidats > 0 ? 'choisir' : 'cliquer';
}

/** Au-delà de cet écart relatif, la surface relevée ne correspond plus à celle annoncée : un bâtiment manque ou est en trop. */
export const ECART_ANNONCE_TOLERE = 0.1;

export interface VerdictAnnonce {
  ton: 'ok' | 'warn';
  texte: string;
}

/** Comparaison entre la surface relevée et la surface annoncée par l'entreprise, dite comme un conseil. */
export function verdictAnnonce(total: number, annonce: number | undefined): VerdictAnnonce | null {
  if (!annonce || annonce <= 0 || !Number.isFinite(total)) return null;
  const ecart = (total - annonce) / annonce;
  const pourcent = `${formatNumber(Math.abs(ecart) * 100, 1)} %`;
  if (Math.abs(ecart) <= ECART_ANNONCE_TOLERE) {
    return { ton: 'ok', texte: `Proche des ${formatArea(annonce)} annoncés par l’entreprise (écart de ${pourcent}).` };
  }
  if (ecart < 0) {
    return {
      ton: 'warn',
      texte: `L’entreprise annonce ${formatArea(annonce)}, ${pourcent} de plus : un bâtiment manque sans doute. Cliquez sur les autres toits du site.`,
    };
  }
  return {
    ton: 'warn',
    texte: `C’est ${pourcent} de plus que la surface annoncée (${formatArea(annonce)}) : un bâtiment voisin a peut-être été ajouté par erreur.`,
  };
}

/** La précision de la surface dite pour un débutant : l'écart probable et la fourchette où se trouve la vraie valeur. */
export function lirePrecision(surface: number, sigma: number): { ecart: string; fourchette: string; pourcent: string } {
  const bas = Math.max(0, Math.round(surface - sigma));
  const haut = Math.round(surface + sigma);
  return {
    ecart: `± ${formatArea(sigma)}`,
    fourchette: `entre ${formatArea(bas)} et ${formatArea(haut)}`,
    pourcent: `${formatNumber(surface > 0 ? (sigma / surface) * 100 : 0, 1)} %`,
  };
}
