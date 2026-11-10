/**
 * Les hauteurs que l'utilisateur a regardées : réglées au curseur, ou confirmées telles quelles. Le projet ne garde
 * que la valeur ; on retient à part, dans ce navigateur, qu'elle a été vérifiée, pour cocher la tâche de l'étape.
 */
import { create } from 'zustand';

const CLE = 'evan.verif.hauteurs';
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

interface HauteursVerifiees {
  ids: string[];
  marquer(id: string): void;
}

export const useHauteursVerifiees = create<HauteursVerifiees>()((set, get) => ({
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
