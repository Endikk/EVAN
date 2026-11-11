/**
 * Membres de l'organisation, côté écran : ce que l'administrateur peut faire sur une ligne, et ce que l'écran dit et
 * fait quand le serveur refuse. Le serveur vérifie tout de nouveau (administrateur de la même organisation, jamais
 * soi-même, jamais le dernier administrateur) : ici, on évite seulement de proposer ce qui sera refusé.
 */
import { ErreurApi } from '@/api/http';
import type { Role } from '@/store/session';

export interface Membre {
  id: string;
  identifiant: string;
  nom: string;
  role: Role;
  creeLe: number;
}

export type ActionMembre = 'retrait' | 'provisoire';

/** Sa propre ligne : ni retrait (un autre administrateur s'en charge) ni mot de passe provisoire (l'actuel est exigé). */
export const estSoi = (m: Membre, identifiantSession: string | undefined): boolean =>
  identifiantSession !== undefined && m.identifiant === identifiantSession.trim().toLowerCase();

/** La liste sans ce compte, sans toucher à l'ancienne (React compare les références). */
export const sansMembre = (liste: readonly Membre[], id: string): Membre[] => liste.filter((m) => m.id !== id);

/**
 * Ce que l'écran fait d'un refus : la phrase à montrer, relire la liste (compte disparu), revérifier la session, et
 * le message à mettre sous le champ « Votre mot de passe » quand c'est lui que le serveur refuse.
 */
export interface Refus {
  texte: string;
  relire: boolean;
  sessionPerdue: boolean;
  motDePasse?: string;
}

const REPLI: Record<ActionMembre, string> = {
  retrait: 'Le retrait n’a pas abouti. Réessayez.',
  provisoire: 'Le mot de passe provisoire n’a pas été créé. Réessayez.',
};

export function refus(err: unknown, action: ActionMembre): Refus {
  if (!(err instanceof ErreurApi)) return { texte: REPLI[action], relire: false, sessionPerdue: false };
  // Retiré entre-temps par un autre administrateur, ou jamais de cette organisation : la liste affichée est périmée.
  if (err.statut === 404) return { texte: 'Ce compte n’existe plus dans votre organisation : la liste est mise à jour.', relire: true, sessionPerdue: false };
  // Session de l'administrateur tombée (expirée, ou lui-même retiré) : la page repasse au formulaire de connexion.
  if (err.statut === 401) return { texte: err.message, relire: false, sessionPerdue: true };
  // Mot de passe de l'administrateur refusé : le message va sous le champ, à ressaisir.
  const champ = err.champs.find((c) => c.champ === 'motDePasse');
  if (champ) return { texte: err.message, relire: false, sessionPerdue: false, motDePasse: champ.message };
  return { texte: err.message || REPLI[action], relire: false, sessionPerdue: false };
}
