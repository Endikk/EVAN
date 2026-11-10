/**
 * Vidéos de « Comment ça marche » : l'écran réel de la démo à chaque étape, filmé avec un curseur
 * (tests/e2e/parcours/tournage.mjs). Fichiers dans public/parcours : la vidéo, son image de début (pendant le
 * chargement) et son image de fin (animations réduites). Durées en millisecondes, mesurées au tournage.
 */
import type { EtapeParcours } from '@/store/ui';

export interface Clip {
  nom: string;
  duree: number;
}

export const CLIPS: Record<EtapeParcours, Clip> = {
  1: { nom: '1-localiser', duree: 9167 },
  2: { nom: '2-plan', duree: 10933 },
  3: { nom: '3-machines', duree: 9567 },
  4: { nom: '4-organes', duree: 9333 },
  5: { nom: '5-connexion', duree: 11567 },
  6: { nom: '6-supervision', duree: 13867 },
  7: { nom: '7-historique', duree: 11167 },
};

export const video = (c: Clip) => `/parcours/${c.nom}.mp4`;
export const imageDebut = (c: Clip) => `/parcours/${c.nom}-debut.webp`;
export const imageFin = (c: Clip) => `/parcours/${c.nom}-fin.webp`;
