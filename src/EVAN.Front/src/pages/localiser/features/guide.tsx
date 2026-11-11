/** « Comment lire cet écran » pour l'étape 1 : un bloc par zone de l'écran, dans l'ordre où on les voit. */
import type { GuideEcran } from '@/ui/explain';
import { GesteAdresse, GesteCoin, GesteToit } from './gestes';

export const GUIDE_LOCALISER: GuideEcran = {
  id: 'localiser',
  titre: 'Trouver l’usine sur la carte',
  resume: (
    <>
      Ici, on montre à EVAN où est l’usine. Il repère le bâtiment sur la photo satellite, trace son contour et mesure sa
      surface au sol. Le plan 3D, les zones et les machines des étapes suivantes se posent sur ce contour.
    </>
  ),
  blocs: [
    {
      titre: 'La barre de recherche',
      cible: 'recherche',
      schema: <GesteAdresse />,
      texte: (
        <>
          <p>
            Tapez l’adresse de l’usine, le nom de l’entreprise, son numéro SIRET ou des coordonnées GPS. Choisissez le
            bon résultat : la carte vole jusqu’au site.
          </p>
          <p>Le badge à droite de chaque résultat dit ce qu’il désigne : un bâtiment précis, ou seulement une rue.</p>
        </>
      ),
    },
    {
      titre: 'Le bâtiment sur la photo',
      cible: 'carte',
      schema: <GesteToit />,
      texte: (
        <>
          <p>
            Cliquez sur le toit de l’usine. EVAN relève son contour auprès de l’IGN (ou d’OpenStreetMap hors de France) et
            l’entoure d’un trait orange.
          </p>
          <p>
            Quand EVAN hésite entre plusieurs bâtiments de la rue, il les propose avec une lettre (A, B, C) : cliquez sur
            la bonne. En zoomant, la longueur de chaque côté s’affiche.
          </p>
          <p>Les bâtiments apparaissent sur la photo avec un trait fin quand on zoome. Les bâtiments proposés pour une adresse sont en pointillé ambre.</p>
        </>
      ),
    },
    {
      titre: 'À faire ici',
      cible: 'a-faire',
      texte: (
        <p>
          La liste se coche toute seule à mesure que vous avancez. Une tâche facultative ne bloque pas la suite : un site
          d’un seul bâtiment n’a rien à ajouter.
        </p>
      ),
    },
    {
      titre: 'Surface au sol',
      cible: 'surface',
      texte: (
        <>
          <p>La surface du toit vue du ciel, en mètres carrés. C’est l’emprise du bâtiment.</p>
          <p>
            La précision dit à quel point on peut s’y fier. Elle dépend de la source (l’IGN est plus précis
            qu’OpenStreetMap) et des coins replacés à la main sur la photo. Le mot « Précision » ouvre l’écart probable.
          </p>
        </>
      ),
    },
    {
      titre: 'Vérifier le contour',
      cible: 'contour',
      schema: <GesteCoin />,
      texte: (
        <>
          <p>
            Le trait orange doit suivre le bord du toit. S’il déborde sur le parking ou coupe un bout du bâtiment,
            « Déplacer les coins » fait apparaître des poignées : glissez-les sur les angles du toit.
          </p>
          <p>Quand le trait colle au toit, dites-le avec « Le contour est juste ».</p>
        </>
      ),
    },
    {
      titre: 'Bâtiments de l’usine',
      cible: 'batiments',
      texte: (
        <p>
          Une usine compte souvent plusieurs bâtiments, par exemple l’atelier d’impression et le stock de bobines.
          Cliquez sur chacun : il s’ajoute à la liste, et la surface totale en tient compte.
        </p>
      ),
    },
  ],
  termes: ['emprise'],
};
