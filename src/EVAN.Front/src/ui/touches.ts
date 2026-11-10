/** Raccourcis écrits comme sur le clavier de la personne : symboles ⌘ et ⇧ sur Mac, Ctrl ailleurs. */
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const RACCOURCI_ANNULER = MAC ? '⌘Z' : 'Ctrl+Z';
export const RACCOURCI_RETABLIR = MAC ? '⇧⌘Z' : 'Ctrl+Y';
