import { Activity, Box, Cable, Cog, Factory, LineChart, MapPin, PlugZap, Wrench, type LucideIcon } from 'lucide-react';
import type { EtapeParcours, Step } from '@/store/ui';

/**
 * Une étape dite trois fois : son nom court (onglet, rail), ce qu'on y fait en clair (`action`) et à quoi ça sert
 * (`pourquoi`). Les deux dernières phrases sont écrites pour quelqu'un qui découvre EVAN.
 */
export interface EtapeInfo {
  n: Step;
  titre: string;
  sous: string;
  action: string;
  pourquoi: string;
  icon: LucideIcon;
}

/** Le parcours en sept étapes, de l'adresse à l'historique (visite guidée, page d'accueil). */
export const STEPS: (EtapeInfo & { n: EtapeParcours })[] = [
  {
    n: 1,
    titre: 'Localiser',
    sous: 'Satellite et emprise exacte',
    action: 'Trouver l’usine sur la carte',
    pourquoi: 'EVAN repère le bâtiment sur la photo satellite et mesure sa surface. Tout le reste se construit dessus.',
    icon: MapPin,
  },
  {
    n: 2,
    titre: 'Plan',
    sous: '3D extrudée ou 2D, zones',
    action: 'Dessiner le plan et les zones',
    pourquoi: 'Le bâtiment passe en 3D. Les zones (impression, stock, expédition) disent où se trouve chaque machine.',
    icon: Box,
  },
  {
    n: 3,
    titre: 'Machines',
    sous: 'Bibliothèque et placement',
    action: 'Poser les machines dans l’atelier',
    pourquoi: 'Chaque machine posée sur le plan devient un repère que l’on retrouve en supervision.',
    icon: Factory,
  },
  {
    n: 4,
    titre: 'Organes',
    sous: 'Organes et points de mesure',
    action: 'Choisir ce qu’on surveille sur chaque machine',
    pourquoi: 'Un organe est une partie de la machine (dérouleur, groupe d’impression…). En cas de panne, EVAN dit lequel lâche.',
    icon: Cog,
  },
  {
    n: 5,
    titre: 'Connexion',
    sous: 'Protocole, test, variables',
    action: 'Brancher les machines à EVAN',
    pourquoi: 'EVAN lit les valeurs de l’automate de chaque machine. Sans connexion, rien ne remonte en direct.',
    icon: Cable,
  },
  {
    n: 6,
    titre: 'Supervision',
    sous: 'Temps réel, pannes',
    action: 'Voir l’atelier en direct',
    pourquoi: 'Quelle machine tourne, laquelle est arrêtée, et quel organe pose problème.',
    icon: Activity,
  },
  {
    n: 7,
    titre: 'Historique',
    sous: 'Alarmes, courbes, TRS',
    action: 'Comprendre ce qui s’est passé',
    pourquoi: 'Les arrêts des derniers jours, machine par machine, pour savoir où l’on perd du temps.',
    icon: LineChart,
  },
];

/** Paramétrage de l'usine (derrière un accès une fois la configuration terminée). */
export const CONFIG_STEPS = STEPS.filter((s) => s.n <= 5);

/** Écrans d'exploitation, accessibles en permanence : la fin du parcours, puis le carnet de maintenance et l'énergie. */
export const EXPLOIT_TABS: EtapeInfo[] = [
  ...STEPS.filter((s) => s.n >= 6),
  {
    n: 8,
    titre: 'Maintenance',
    sous: 'Carnet, échéances, pannes rejouées',
    action: 'Savoir quoi entretenir, et quand',
    pourquoi: 'Les entretiens à faire, ceux en retard, et ce qui a été fait.',
    icon: Wrench,
  },
  {
    n: 9,
    titre: 'Énergie',
    sous: 'kWh, CO₂, courbe de charge',
    action: 'Voir ce que l’usine consomme',
    pourquoi: 'Combien d’électricité, à quel moment, et où l’on peut en économiser.',
    icon: PlugZap,
  },
];
