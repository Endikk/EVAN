/**
 * Ce que dit le volet « Comment ça marche » de chaque étape du parcours : où elle se situe, et où la voir en vrai.
 */
import { CONFIG_STEPS, STEPS } from '@/widgets/shell/steps';
import type { EtapeParcours } from '@/store/ui';

/**
 * Place d'une étape, dite comme l'application la dit. Les étapes de configuration sont comptées sur cinq, comme dans
 * l'assistant que montre la vidéo (« Étape 1 sur 5 ») ; la supervision et l'historique servent chaque jour et n'ont
 * pas de numéro dans l'application.
 */
export function situerEtape(n: EtapeParcours): string {
  const titre = STEPS.find((s) => s.n === n)?.titre ?? '';
  const rang = CONFIG_STEPS.findIndex((s) => s.n === n);
  return rang >= 0 ? `Configuration · étape ${rang + 1} sur ${CONFIG_STEPS.length} · ${titre}` : `Chaque jour · ${titre}`;
}

/**
 * La même étape dans la démo : la visite guidée démarre au chapitre qui la raconte, sur l'écran réel. Ses sept
 * premiers chapitres suivent les sept étapes, dans le même ordre (widgets/tour/tour.ts).
 */
export const lienDemo = (n: EtapeParcours) => `/demo?visite=${n}`;
