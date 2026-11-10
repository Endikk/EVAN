/** « Comment lire cet écran » pour l'étape 2 : un bloc par zone de l'écran, dans l'ordre où on les voit. */
import type { GuideEcran } from '@/ui/explain';
import { ZONE_COULEUR, ZONE_LIBELLE } from '@/widgets/scene/Zones3D';
import { ORDRE_ZONES, ZONE_SENS } from '../lib/typesZone';
import { GesteVue, GesteZone } from './gestes';

export const GUIDE_PLAN: GuideEcran = {
  id: 'plan',
  titre: 'Dessiner le plan et les zones',
  resume: (
    <>
      Le contour relevé à l’étape 1 devient un bâtiment en volume. Ici, on règle sa hauteur et on découpe l’atelier en
      zones : les presses d’un côté, le stock de bobines de l’autre. À l’étape suivante, chaque machine se pose dans sa
      zone.
    </>
  ),
  blocs: [
    {
      titre: 'À faire ici',
      cible: 'a-faire',
      texte: <p>La liste se coche toute seule. Les zones en plus de la première sont facultatives, mais rendent le plan lisible d’un coup d’œil.</p>,
    },
    {
      titre: 'Vue 3D ou plan 2D',
      cible: 'vue',
      schema: <GesteVue />,
      texte: (
        <p>
          La 3D montre le bâtiment en volume : c’est là qu’on juge sa hauteur. Le plan 2D le montre vu de dessus, à
          l’échelle : c’est là qu’on dessine les zones. On passe de l’un à l’autre sans rien perdre.
        </p>
      ),
    },
    {
      titre: 'Hauteur des bâtiments',
      cible: 'hauteurs',
      texte: (
        <>
          <p>
            La hauteur sous toiture, du sol au bas du toit. L’IGN la donne pour la plupart des bâtiments ; sinon, EVAN met
            une valeur par défaut.
          </p>
          <p>Glissez le curseur jusqu’à ce que la 3D ressemble à votre bâtiment, ou confirmez la valeur si elle est juste.</p>
        </>
      ),
    },
    {
      titre: 'Les types de zone',
      cible: 'zones',
      texte: (
        <ul className="pln-guide-types">
          {ORDRE_ZONES.map((t) => (
            <li key={t}>
              <i style={{ background: ZONE_COULEUR[t] }} aria-hidden />
              <span>
                <b>{ZONE_LIBELLE[t]}</b> : {ZONE_SENS[t].charAt(0).toLowerCase() + ZONE_SENS[t].slice(1)}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      titre: 'Dessiner une zone',
      cible: 'zones',
      schema: <GesteZone />,
      texte: (
        <p>
          Choisissez un type : le plan passe en 2D. Appuyez à un coin de la zone, glissez jusqu’au coin opposé, relâchez.
          Le rectangle s’aimante au mètre près et ses côtés s’affichent pendant le geste.
        </p>
      ),
    },
    {
      titre: 'Vos zones',
      cible: 'zones-liste',
      texte: (
        <p>
          Cliquez sur une zone pour la renommer ou changer son type. Sur le plan 2D, glissez-la pour la déplacer et tirez
          ses coins pour l’agrandir.
        </p>
      ),
    },
  ],
  termes: ['zone', 'emprise'],
};
