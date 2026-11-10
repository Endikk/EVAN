/**
 * Les contours que l'utilisateur a regardés et validés (« Le contour est juste », ou une correction faite).
 * Rien dans le projet ne le dit : on le garde à part, dans ce navigateur, pour cocher la tâche « Vérifier le contour ».
 */
import { create } from 'zustand';

const CLE = 'evan.verif.contours';
/** On ne garde que les derniers : un identifiant de bâtiment ne sert plus une fois l'usine supprimée. */
const MAX = 300;

function lire(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CLE) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface ContoursVerifies {
  ids: string[];
  marquer(id: string): void;
}

export const useContoursVerifies = create<ContoursVerifies>()((set, get) => ({
  ids: lire(),
  marquer: (id) => {
    if (get().ids.includes(id)) return;
    const ids = [...get().ids, id].slice(-MAX);
    set({ ids });
    try {
      localStorage.setItem(CLE, JSON.stringify(ids));
    } catch {
      /* navigation privée : la coche tiendra le temps de la session */
    }
  },
}));
