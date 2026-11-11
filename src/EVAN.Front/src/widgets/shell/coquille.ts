/**
 * État de la coquille de l'espace de travail : barre latérale repliée (icônes seules, choix gardé dans ce navigateur)
 * et, sur téléphone, menu latéral ouvert par-dessus l'écran.
 *
 * Sans choix gardé, la barre part repliée sur tablette (jusqu'à 1280 px) et dépliée au-delà. Sur tablette, elle se
 * déplie comme sur grand écran : les icônes seules, sans moyen de lire leur nom au toucher, ne suffisaient pas.
 */
import { create } from 'zustand';

const CLE_REPLIE = 'evan.barre-repliee';

/** Choix gardé ('1' replié, '0' déplié), sinon repliée sur les écrans de tablette. */
export function replieAuDepart(garde: string | null, tablette: boolean): boolean {
  if (garde === '1') return true;
  if (garde === '0') return false;
  return tablette;
}

function lireReplie(): boolean {
  let garde: string | null = null;
  try {
    garde = localStorage.getItem(CLE_REPLIE);
  } catch {
    /* navigation privée : pas de choix gardé */
  }
  const tablette = typeof window !== 'undefined' && window.matchMedia('(max-width: 1280px)').matches;
  return replieAuDepart(garde, tablette);
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
