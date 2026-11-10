/**
 * Enregistrement côté serveur de l'organisation d'un compte connecté : chaque usine modifiée part vers le serveur
 * quelques secondes après la dernière modification, et tout de suite à « Terminer ». Seules les usines dont la
 * configuration a changé depuis le dernier enregistrement réussi sont renvoyées.
 * Sans compte, rien ne se passe ici : l'organisation reste dans le navigateur (store/project.ts).
 */
import { create } from 'zustand';
import { ErreurApi, type ChampRefuse } from '@/api/http';
import { versConfiguration } from '@/api/configuration';
import { enregistrerUsine } from '@/api/usine';
import { listUsines, useProject, type ProjectState } from './project';

/** Délai après la dernière modification avant l'envoi : assez pour ne pas envoyer chaque glissement de souris. */
export const DELAI_AUTO_MS = 5000;

/** modifie : des changements attendent l'envoi ; erreur : le dernier envoi a été refusé ou n'a pas abouti. */
export type EtatEnregistrement = 'inactif' | 'modifie' | 'enregistrement' | 'enregistre' | 'erreur';

export interface ErreurEnregistrement {
  /** Usine en cause. */
  usine: string;
  message: string;
  champs: ChampRefuse[];
}

interface EnregistrementState {
  etat: EtatEnregistrement;
  /** Heure du dernier enregistrement réussi. */
  derniere?: number;
  erreur?: ErreurEnregistrement;
  /** Envoie tout de suite les usines modifiées. Vrai si tout est enregistré. */
  enregistrer(): Promise<boolean>;
}

/** Dernière configuration enregistrée de chaque usine (texte JSON), pour n'envoyer que ce qui a changé. */
const enregistrees = new Map<string, string>();
let minuterie: ReturnType<typeof setTimeout> | undefined;
let enCours: Promise<boolean> | null = null;

/** Les usines dont la configuration diffère de la dernière enregistrée. */
function aEnvoyer(s: ProjectState) {
  return listUsines(s)
    .map((u) => ({ nom: u.site?.nom ?? 'Nouvelle usine', configuration: versConfiguration(u) }))
    .filter((x): x is { nom: string; configuration: NonNullable<typeof x.configuration> } => x.configuration !== null)
    .map((x) => ({ ...x, texte: JSON.stringify(x.configuration) }))
    .filter((x) => enregistrees.get(x.configuration.site.id) !== x.texte);
}

export const useEnregistrement = create<EnregistrementState>()((set, get) => ({
  etat: 'inactif',
  enregistrer: (): Promise<boolean> => {
    clearTimeout(minuterie);
    // Un envoi est en cours : on attend sa fin, puis on renvoie ce qui a changé depuis.
    if (enCours) return enCours.then(() => get().enregistrer());
    const projet = useProject.getState();
    if (!projet.serveur) return Promise.resolve(true);
    enCours = (async () => {
      const liste = aEnvoyer(projet);
      // Rien de différent du serveur (une usine refusée resterait dans la liste) : tout est enregistré.
      if (!liste.length) {
        set({ etat: 'enregistre', erreur: undefined });
        return true;
      }
      set({ etat: 'enregistrement' });
      for (const x of liste) {
        try {
          await enregistrerUsine(x.configuration);
          enregistrees.set(x.configuration.site.id, x.texte);
        } catch (err) {
          const e = err instanceof ErreurApi ? err : new ErreurApi(0, 'Enregistrement interrompu.');
          set({ etat: 'erreur', erreur: { usine: x.nom, message: e.message, champs: e.champs } });
          return false;
        }
      }
      set({ etat: 'enregistre', derniere: Date.now(), erreur: undefined });
      return true;
    })().finally(() => {
      enCours = null;
    });
    return enCours;
  },
}));

/** Après la relecture depuis le serveur : ce qui vient d'être lu est déjà enregistré, rien à renvoyer. */
export function initialiserEnregistrement() {
  clearTimeout(minuterie);
  enregistrees.clear();
  for (const u of listUsines(useProject.getState())) {
    const c = versConfiguration(u);
    if (c) enregistrees.set(c.site.id, JSON.stringify(c));
  }
  useEnregistrement.setState({ etat: 'enregistre', derniere: undefined, erreur: undefined });
}

/** Il reste des modifications que le serveur n'a pas : quitter la page les perdrait. */
export const nonEnregistre = () => ['modifie', 'enregistrement', 'erreur'].includes(useEnregistrement.getState().etat);

// Toute modification de l'organisation d'un compte programme un envoi ; seule une modification réelle de la
// configuration est envoyée (comparée au moment de l'envoi).
useProject.subscribe((s, avant) => {
  if (!s.serveur || s.mode !== 'assistant') return;
  const change =
    s.site !== avant.site ||
    s.batiments !== avant.batiments ||
    s.zones !== avant.zones ||
    s.machines !== avant.machines ||
    s.connexions !== avant.connexions ||
    s.perso !== avant.perso ||
    s.configure !== avant.configure ||
    s.usines !== avant.usines;
  if (!change || !avant.serveur) return;
  if (useEnregistrement.getState().etat !== 'erreur') useEnregistrement.setState({ etat: 'modifie' });
  clearTimeout(minuterie);
  minuterie = setTimeout(() => void useEnregistrement.getState().enregistrer(), DELAI_AUTO_MS);
});
