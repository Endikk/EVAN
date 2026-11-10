/** « Comment lire cet écran » pour l'étape 3 : un bloc par zone du panneau, de haut en bas. */
import type { GuideEcran } from '@/ui/explain';
import { GesteDepot, PAS_GRILLE_CM } from './GesteDepot';

export const GUIDE_MACHINES: GuideEcran = {
  id: 'machines',
  titre: 'Poser les machines',
  resume:
    'Ici, chaque machine de l’atelier prend sa place sur le plan. Une machine posée devient un repère : on la retrouve en supervision, dans les alarmes et dans l’historique, sous son numéro.',
  blocs: [
    {
      titre: 'À faire ici',
      cible: 'a-faire',
      texte: (
        <p>
          La liste se coche seule à mesure que vous avancez. Le numéro de chaque machine est obligatoire et ne doit pas servir deux fois. Le nom est
          un confort : des presses qui s’appellent toutes « Rotative offset » se reconnaissent mieux sous le nom qu’on leur donne à l’atelier.
        </p>
      ),
    },
    {
      titre: 'La machine posée',
      cible: 'machines-fiche',
      texte: (
        <p>
          Après une pose, la machine reste sélectionnée en haut du panneau. Donnez-lui son numéro (R01, PP01…) et son nom, puis tournez-la dans le
          sens où défile la bande. Un clic sur une machine du plan la rouvre ici.
        </p>
      ),
    },
    {
      titre: 'Le geste : glisser, lâcher',
      cible: 'machines-geste',
      schema: <GesteDepot />,
      texte: (
        <>
          <p>
            Attrapez une carte de la bibliothèque et lâchez-la sur le plan, à l’endroit de la machine. Elle s’aligne sur une grille de{' '}
            {PAS_GRILLE_CM} cm : deux presses posées côte à côte restent bien parallèles.
          </p>
          <p>Sur tablette, touchez la carte, puis l’endroit du plan.</p>
        </>
      ),
    },
    {
      titre: 'La bibliothèque',
      cible: 'machines-bibliotheque',
      texte: (
        <p>
          Les machines du kit imprimerie, rangées par métier : celles qui impriment, celle qui grave les plaques, celles qui finissent les
          étiquettes (refente, paravent, planches). Chacune arrive avec ses organes déjà décrits, du dérouleur au rembobineur. Une machine absente du
          kit s’importe en 3D.
        </p>
      ),
    },
    {
      titre: 'Les machines posées',
      cible: 'machines-liste',
      texte: (
        <p>
          Toutes les machines de l’usine, avec la zone où elles se trouvent. Un clic sélectionne la machine et place la caméra devant elle.
        </p>
      ),
    },
  ],
  termes: ['zone', 'organe'],
};

/** Le même guide, sans bouton « Montrer » pour les blocs absents de l'écran en ce moment (usine encore vide). */
export function guideSelon(guide: GuideEcran, presents: Record<string, boolean>): GuideEcran {
  return { ...guide, blocs: guide.blocs.map((b) => (b.cible && presents[b.cible] === false ? { ...b, cible: undefined } : b)) };
}
