/** Ce que fait un clic sur une machine dans un graphique de l'historique : la choisir pour tout l'écran, ou y renoncer. */
export const nommerClic = (numero: string, choisie: boolean) => (choisie ? 'revoir toutes les machines' : `ne voir que ${numero}`);
