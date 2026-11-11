/**
 * Vidéos de « Comment ça marche » : l'écran réel de la démo à chaque étape, filmé avec un curseur
 * (tests/e2e/parcours/tournage.mjs). La caméra du tournage suit le geste dans un cadre de la moitié de l'écran : le
 * texte de l'interface se lit dans le volet. Chaque étape est tournée deux fois, de nuit et de jour (suffixe -jour),
 * pour que la vidéo garde le thème de la page qui la montre.
 *
 * Fichiers dans public/parcours : la vidéo, son image de début (pendant le chargement) et son image de fin (animations
 * réduites). Durées en millisecondes, mesurées au tournage de nuit (renseignement, la lecture suit la vidéo elle-même).
 */
import type { EtapeParcours } from '@/store/ui';

export interface Clip {
  nom: string;
  duree: number;
}

export const CLIPS: Record<EtapeParcours, Clip> = {
  1: { nom: '1-localiser', duree: 12833 },
  2: { nom: '2-plan', duree: 11567 },
  3: { nom: '3-machines', duree: 9767 },
  4: { nom: '4-organes', duree: 11267 },
  5: { nom: '5-connexion', duree: 16433 },
  6: { nom: '6-supervision', duree: 15667 },
  7: { nom: '7-historique', duree: 11033 },
};

const fichier = (c: Clip, jour: boolean) => `/parcours/${c.nom}${jour ? '-jour' : ''}`;

export const video = (c: Clip, jour = false) => `${fichier(c, jour)}.mp4`;
export const imageDebut = (c: Clip, jour = false) => `${fichier(c, jour)}-debut.webp`;
export const imageFin = (c: Clip, jour = false) => `${fichier(c, jour)}-fin.webp`;
