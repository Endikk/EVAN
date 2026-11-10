/**
 * Session de l'utilisateur : qui est connecté, et à quelle organisation. Sans serveur EVAN (démo dans le navigateur
 * seul), il n'y a pas de compte : l'état est « sansApi » et rien ne change pour la démo ni pour l'assistant local.
 */
import { create } from 'zustand';
import { appel } from '@/api/http';

export type Role = 'admin' | 'membre';

export interface Utilisateur {
  identifiant: string;
  nom: string;
  role: Role;
}

export interface OrganisationSession {
  id: string;
  nom: string;
}

/** inconnu : pas encore demandé ; sansApi : pas de serveur EVAN derrière le front. */
export type EtatSession = 'inconnu' | 'anonyme' | 'connecte' | 'sansApi';

interface VueSession {
  connecte: boolean;
  utilisateur?: Utilisateur;
  organisation?: OrganisationSession;
}

interface SessionState {
  etat: EtatSession;
  utilisateur?: Utilisateur;
  organisation?: OrganisationSession;
  /** Demande au serveur qui est connecté (une seule fois, sauf `forcer`). */
  verifier(forcer?: boolean): Promise<EtatSession>;
  /** Ouvre une session ; lève ErreurApi (identifiants refusés, trop d'essais, serveur injoignable). */
  connecter(identifiant: string, motDePasse: string): Promise<void>;
  deconnecter(): Promise<void>;
}

let enCours: Promise<EtatSession> | null = null;

function appliquer(v: VueSession): Pick<SessionState, 'etat' | 'utilisateur' | 'organisation'> {
  return v.connecte && v.utilisateur && v.organisation
    ? { etat: 'connecte', utilisateur: v.utilisateur, organisation: v.organisation }
    : { etat: 'anonyme', utilisateur: undefined, organisation: undefined };
}

export const useSession = create<SessionState>()((set, get) => ({
  etat: 'inconnu',

  verifier: (forcer = false) => {
    if (!forcer && get().etat !== 'inconnu') return Promise.resolve(get().etat);
    if (enCours && !forcer) return enCours;
    enCours = (async () => {
      try {
        const res = await fetch('/api/session', { credentials: 'same-origin', signal: AbortSignal.timeout(3000) });
        // Front servi seul (page HTML, ou 404) : pas de serveur EVAN, donc pas de compte.
        if (!res.ok || !res.headers.get('content-type')?.includes('json')) {
          set({ etat: 'sansApi', utilisateur: undefined, organisation: undefined });
        } else {
          set(appliquer((await res.json()) as VueSession));
        }
      } catch {
        set({ etat: 'sansApi', utilisateur: undefined, organisation: undefined });
      }
      enCours = null;
      return get().etat;
    })();
    return enCours;
  },

  connecter: async (identifiant, motDePasse) => {
    const vue = await appel<VueSession>('POST', '/api/session', { identifiant, motDePasse });
    set(appliquer(vue));
  },

  deconnecter: async () => {
    try {
      await appel('DELETE', '/api/session');
    } finally {
      // Même si le serveur ne répond pas, l'écran ne montre plus la session.
      set({ etat: 'anonyme', utilisateur: undefined, organisation: undefined });
    }
  },
}));
