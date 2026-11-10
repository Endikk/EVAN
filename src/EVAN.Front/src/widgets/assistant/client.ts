/**
 * Client de l'assistant « Demander à EVAN » : EVAN.Api appelle Claude (clé côté serveur) avec les outils d'EVAN,
 * les mêmes que ceux du serveur MCP (/mcp). La réponse arrive en flux SSE : appels d'outils, puis texte.
 * Hors du poste du serveur, le back demande un code d'accès (Authorization: Bearer), gardé le temps de l'onglet.
 */
import { ENTETE_ECRITURE } from '@/api/http';

export interface Disponibilite {
  disponible: boolean;
  modele?: string;
  /** Adresse du serveur MCP exposé par le back. */
  mcp?: string;
  /** « local » : poste du serveur ; « code » : code d'accès demandé ; « ferme » : réseau refusé. */
  acces?: 'local' | 'code' | 'ferme';
  /** Longueur maximale d'une question. */
  caracteresMax?: number;
  raison?: string;
}

/** Le back demande le code d'accès (absent ou refusé). */
export class CodeRequis extends Error {}

/** Messages envoyés au plus (borne du back) : les plus récents. */
export const MESSAGES_MAX = 20;

const CLE_CODE = 'evan.assistant.code';

/** Code d'accès de l'onglet (sessionStorage : oublié à la fermeture, jamais partagé entre onglets). */
export function codeAcces(): string | null {
  try {
    return sessionStorage.getItem(CLE_CODE);
  } catch {
    return null;
  }
}

export function retenirCode(code: string | null): void {
  try {
    if (code) sessionStorage.setItem(CLE_CODE, code);
    else sessionStorage.removeItem(CLE_CODE);
  } catch {
    // Stockage indisponible (navigation privée stricte) : le code sera redemandé.
  }
}

export interface AppelOutil {
  nom: string;
  arguments: Record<string, unknown>;
}

export interface MessageAssistant {
  role: 'user' | 'assistant';
  texte: string;
}

/** null : pas de back (simulateur du navigateur), l'assistant n'est pas joignable. */
export async function disponibilite(): Promise<Disponibilite | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('/api/assistant', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null;
    return (await res.json()) as Disponibilite;
  } catch {
    return null;
  }
}

export interface Rappels {
  outil(a: AppelOutil): void;
  texte(delta: string): void;
}

/** Message d'un refus du back : son texte ({ erreur }) s'il en donne un, sinon une phrase selon le statut. */
async function motif(res: Response): Promise<string> {
  try {
    const corps = (await res.json()) as { erreur?: string; detail?: string };
    if (corps.erreur || corps.detail) return String(corps.erreur ?? corps.detail);
  } catch {
    // Corps absent ou non JSON (proxy) : message générique ci-dessous.
  }
  if (res.status === 429) return 'Trop de questions d’affilée : attendez une minute, puis reposez la vôtre.';
  if (res.status === 503) return 'L’assistant n’est pas activé sur le serveur EVAN : il lui manque la clé Claude.';
  if (res.status >= 500) return `Le serveur EVAN n’a pas pu répondre (erreur ${res.status}). Reposez la question dans un moment.`;
  return `Le serveur EVAN a refusé la question (erreur ${res.status}).`;
}

/** Échec réseau (serveur arrêté, connexion coupée) : le navigateur ne dit que « Failed to fetch ». */
export function messageErreur(e: unknown): string {
  if (e instanceof TypeError) return 'Le serveur EVAN ne répond pas. Vérifiez la connexion, puis reposez la question.';
  return e instanceof Error && e.message ? e.message : 'L’assistant n’a pas pu répondre.';
}

/** Pose la question ; résout à la fin du flux, rejette sur une erreur du back ou du modèle (CodeRequis si le code manque). */
export async function demander(siteId: string, messages: MessageAssistant[], on: Rappels, signal?: AbortSignal): Promise<void> {
  const code = codeAcces();
  const res = await fetch('/api/assistant', {
    method: 'POST',
    headers: {
      ...ENTETE_ECRITURE,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...(code ? { Authorization: `Bearer ${code}` } : {}),
    },
    body: JSON.stringify({ siteId, messages: messages.slice(-MESSAGES_MAX) }),
    signal,
  });
  if (res.status === 401) {
    retenirCode(null);
    throw new CodeRequis(await motif(res));
  }
  if (!res.ok || !res.body) throw new Error(await motif(res));
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let tampon = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    tampon += value;
    let fin: number;
    while ((fin = tampon.indexOf('\n\n')) >= 0) {
      const bloc = tampon.slice(0, fin);
      tampon = tampon.slice(fin + 2);
      const event = /^event: (.*)$/m.exec(bloc)?.[1];
      const data = bloc
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (!event || !data) continue;
      const payload = JSON.parse(data) as Record<string, unknown>;
      if (event === 'outil') on.outil(payload as unknown as AppelOutil);
      else if (event === 'texte') on.texte(String(payload.delta ?? ''));
      else if (event === 'erreur') throw new Error(String(payload.message ?? 'L’assistant s’est interrompu en cours de réponse.'));
      else if (event === 'fin') return;
    }
  }
}
