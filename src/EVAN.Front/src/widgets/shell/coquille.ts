/**
 * État de la coquille de l'espace de travail : barre latérale repliée (icônes seules, choix gardé dans ce navigateur)
 * et, sur téléphone, menu latéral ouvert par-dessus l'écran.
 */
import { create } from 'zustand';

const CLE_REPLIE = 'evan.barre-repliee';

function lireReplie(): boolean {
  try {
    return localStorage.getItem(CLE_REPLIE) === '1';
  } catch {
    return false;
  }
}

interface Coquille {
  /** Barre latérale réduite aux icônes, sur grand écran. */
  replie: boolean;
  /** Téléphone et tablette : barre latérale ouverte par-dessus l'écran. */
  menuOuvert: boolean;
  setReplie(v: boolean): void;
  setMenuOuvert(v: boolean): void;
}

export const useCoquille = create<Coquille>()((set) => ({
  replie: lireReplie(),
  menuOuvert: false,
  setReplie: (replie) => {
    try {
      localStorage.setItem(CLE_REPLIE, replie ? '1' : '0');
    } catch {
      /* navigation privée : le choix vaut pour cette visite */
    }
    set({ replie });
  },
  setMenuOuvert: (menuOuvert) => set({ menuOuvert }),
}));
