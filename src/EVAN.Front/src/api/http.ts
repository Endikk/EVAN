/**
 * Appels à EVAN.Api : JSON, délai borné, cookie de session joint (même origine), et l'en-tête X-Evan sur toute
 * écriture. Le back refuse une écriture qui ne le porte pas : c'est sa protection contre les requêtes venues d'un
 * autre site (un formulaire ou une image d'une page tierce ne sait pas poser d'en-tête).
 */

/** À joindre à toute écriture (POST, PUT, DELETE) vers /api. */
export const ENTETE_ECRITURE = { 'X-Evan': '1' } as const;

/** Champ refusé par le serveur : son chemin dans la saisie (« machines[3].nom ») et la raison, en clair. */
export interface ChampRefuse {
  champ: string;
  message: string;
}

/** Refus ou panne du serveur : le statut HTTP (0 sans réponse), la phrase à montrer, les champs en cause. */
export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
    readonly champs: ChampRefuse[] = [],
  ) {
    super(message);
    this.name = 'ErreurApi';
  }
}

const DELAI_MS = 10_000;

/** Phrase par défaut d'un statut, quand le serveur n'en donne pas. */
function phrase(statut: number): string {
  if (statut === 401) return 'Connexion requise : votre session a peut-être expiré.';
  if (statut === 403) return 'Action réservée à un administrateur de l’organisation.';
  if (statut === 404) return 'Introuvable sur le serveur.';
  if (statut === 413) return 'Envoi trop volumineux pour le serveur.';
  if (statut === 429) return 'Trop de demandes rapprochées : patientez un instant.';
  if (statut >= 500) return `Le serveur EVAN n’a pas pu répondre (erreur ${statut}). Réessayez dans un instant.`;
  return `Le serveur EVAN a refusé la demande (erreur ${statut}).`;
}

/** Lit l'erreur d'une réponse refusée ({ erreur, champs }), avec une phrase de repli si le corps n'en dit rien. */
export async function erreurDe(res: Response): Promise<ErreurApi> {
  try {
    const corps = (await res.json()) as { erreur?: unknown; champs?: unknown };
    const champs = Array.isArray(corps.champs)
      ? corps.champs.filter((c): c is ChampRefuse => typeof c?.champ === 'string' && typeof c?.message === 'string')
      : [];
    return new ErreurApi(res.status, typeof corps.erreur === 'string' && corps.erreur ? corps.erreur : phrase(res.status), champs);
  } catch {
    return new ErreurApi(res.status, phrase(res.status));
  }
}

type Methode = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Appel JSON. Résout avec le corps (undefined pour une réponse vide), lève ErreurApi sinon : statut 0 si le serveur
 * ne répond pas (arrêté, réseau coupé, délai dépassé).
 */
export async function appel<T>(methode: Methode, url: string, corps?: unknown, delaiMs = DELAI_MS): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: methode,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(methode === 'GET' ? {} : ENTETE_ECRITURE),
        ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      signal: AbortSignal.timeout(delaiMs),
    });
  } catch {
    throw new ErreurApi(0, 'Le serveur EVAN ne répond pas. Vérifiez la connexion, puis réessayez.');
  }
  if (!res.ok) throw await erreurDe(res);
  if (res.status === 204 || !res.headers.get('content-type')?.includes('json')) return undefined as T;
  return (await res.json()) as T;
}
