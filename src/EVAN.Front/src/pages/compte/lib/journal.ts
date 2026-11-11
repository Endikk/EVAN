/**
 * Journal des comptes, côté écran : ce que le serveur a noté (qui a fait quoi à quel compte, d'où, quand) dit en
 * phrases, rangé par jour local, et filtré par action ou par personne. Le serveur ne renvoie que les 200 dernières
 * lignes de l'organisation de la session, et jamais de mot de passe.
 */
import { ErreurApi } from '@/api/http';

/** Une ligne telle que la rend GET /api/organisation/journal-comptes (le : ms epoch). */
export interface LigneJournal {
  action: string;
  auteur: string;
  cible: string;
  adresse: string;
  le: number;
}

/** Lignes rendues au plus par le serveur (OrganisationEndpoints.JournalMax). */
export const JOURNAL_MAX = 200;

/** Les actions que le serveur journalise, avec leur nom au pluriel pour le filtre. */
export const ACTIONS = [
  { valeur: 'creation', libelle: 'Créations de compte' },
  { valeur: 'retrait', libelle: 'Retraits' },
  { valeur: 'reinitialisation', libelle: 'Mots de passe provisoires' },
  { valeur: 'changement', libelle: 'Changements de mot de passe' },
] as const;

const VERBES: Record<string, string> = {
  creation: 'a créé le compte de',
  retrait: 'a retiré',
  reinitialisation: 'a donné un mot de passe provisoire à',
};

/** L'action en clair, entre l'auteur et la cible ; sans cible quand le titulaire change son propre mot de passe. */
export function phrase(l: LigneJournal): { verbe: string; cible?: string } {
  if (l.action === 'changement') return l.cible === l.auteur ? { verbe: 'a changé son mot de passe' } : { verbe: 'a changé le mot de passe de', cible: l.cible };
  // Une action ajoutée côté serveur avant l'écran reste lisible au lieu de disparaître.
  return { verbe: VERBES[l.action] ?? 'a modifié le compte de', cible: l.cible };
}

/** Garde les lignes bien formées : la réponse vient du réseau, rien n'en est supposé. */
export function lignesValides(brut: unknown): LigneJournal[] {
  if (!Array.isArray(brut)) return [];
  return brut.filter(
    (l): l is LigneJournal =>
      typeof l?.action === 'string' &&
      typeof l?.auteur === 'string' &&
      typeof l?.cible === 'string' &&
      typeof l?.adresse === 'string' &&
      typeof l?.le === 'number' &&
      Number.isFinite(l.le),
  );
}

/** Chaque personne nommée dans le journal, qu'elle ait agi ou subi l'action, une fois, par ordre alphabétique. */
export const personnes = (lignes: readonly LigneJournal[]): string[] =>
  [...new Set(lignes.flatMap((l) => [l.auteur, l.cible]))].sort((a, b) => a.localeCompare(b, 'fr'));

export interface Filtre {
  /** '' : toutes les actions. */
  action: string;
  /** '' : toutes les personnes. */
  personne: string;
}

/** Lignes qui passent le filtre ; la liste d'origine telle quelle sans filtre. */
export function filtrer(lignes: readonly LigneJournal[], { action, personne }: Filtre): readonly LigneJournal[] {
  if (!action && !personne) return lignes;
  return lignes.filter((l) => (!action || l.action === action) && (!personne || l.auteur === personne || l.cible === personne));
}

const JOUR_MS = 86_400_000;
const minuit = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const heureMinute = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const jourCetteAnnee = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const jourAutreAnnee = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Titre d'un jour, heure locale : « Aujourd'hui », « Hier », « Mardi 3 novembre », l'année quand elle diffère. */
function titreJour(t: number, maintenant: number): string {
  // Arrondi : un jour de changement d'heure dure 23 ou 25 heures.
  const ecart = Math.round((minuit(maintenant) - minuit(t)) / JOUR_MS);
  if (ecart === 0) return 'Aujourd’hui';
  if (ecart === 1) return 'Hier';
  const format = new Date(t).getFullYear() === new Date(maintenant).getFullYear() ? jourCetteAnnee : jourAutreAnnee;
  return capitale(format.format(t));
}

export interface JourJournal {
  cle: number;
  titre: string;
  lignes: { ligne: LigneJournal; heure: string; iso: string }[];
}

/** Les lignes rangées par jour local, le plus récent d'abord, chacune avec son heure. */
export function jours(lignes: readonly LigneJournal[], maintenant: number): JourJournal[] {
  const parJour = new Map<number, JourJournal>();
  for (const ligne of [...lignes].sort((a, b) => b.le - a.le)) {
    const cle = minuit(ligne.le);
    const jour = parJour.get(cle) ?? { cle, titre: titreJour(ligne.le, maintenant), lignes: [] };
    parJour.set(cle, { ...jour, lignes: [...jour.lignes, { ligne, heure: heureMinute.format(ligne.le), iso: new Date(ligne.le).toISOString() }] });
  }
  return [...parJour.values()];
}

/**
 * Ce que l'écran fait d'une lecture refusée : 403, la section disparaît (plus administrateur) ; 401, la session est
 * revérifiée (la page repasse à la connexion) ; sinon la phrase à montrer, avec de quoi réessayer.
 */
export function issueLecture(err: unknown): { masquer: boolean; sessionPerdue: boolean; texte: string } {
  if (!(err instanceof ErreurApi)) return { masquer: false, sessionPerdue: false, texte: 'Journal indisponible pour l’instant.' };
  if (err.statut === 403) return { masquer: true, sessionPerdue: false, texte: '' };
  return { masquer: false, sessionPerdue: err.statut === 401, texte: err.message };
}
