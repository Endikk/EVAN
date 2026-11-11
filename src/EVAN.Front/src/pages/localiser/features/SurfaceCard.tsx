/**
 * La mesure qui compte : la surface au sol du bâtiment, en grand. Sa précision est dite par un mot et une jauge ;
 * l'écart chiffré s'ouvre depuis le mot « Précision ». Les autres mesures suivent en une rangée toujours visible,
 * leur sens et leur méthode s'ouvrant depuis leur libellé.
 */
import type { CSSProperties } from 'react';
import type { Batiment } from '@/domain/types';
import { DEFAULT_HEIGHT } from '@/geo/footprint';
import { formatNumber } from '@/geo/geodesy';
import { AnimatedNumber } from '@/ui/anim';
import { ChiffresSecondaires, TitreCarte, TonGlyph, type ChiffreSecondaire } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { precisionLabel, type BuildingMeasure } from '@/widgets/carte/measure';
import { NiveauxBatiment } from '@/widgets/usines/NiveauxBatiment';
import { lirePrecision } from '../lib/verdicts';

const SOURCE: Record<Batiment['source'], string> = {
  bdtopo: 'IGN, BD TOPO',
  osm: 'OpenStreetMap',
  manuel: 'Tracé à la main',
  demo: 'Usine d’exemple',
};

/** Le nom de la source en un mot, pour la rangée des mesures. */
const SOURCE_COURT: Record<Batiment['source'], string> = {
  bdtopo: 'IGN',
  osm: 'OSM',
  manuel: 'À la main',
  demo: 'Exemple',
};

const formatSurface = (v: number) => formatNumber(Math.round(v));

/** Durée de la montée du chiffre ; pendant qu'on glisse un coin, la surface suit la souris sans délai. */
const MONTEE_MS = 900;
const SANS_DELAI_MS = 16;

function mesures(b: Batiment, m: BuildingMeasure): ChiffreSecondaire[] {
  const niveaux = `${b.niveaux} niveau${b.niveaux > 1 ? 'x' : ''}`;
  const source = SOURCE_COURT[b.source];
  return [
    {
      label: 'Dimensions',
      valeur: `${formatNumber(m.length, 1)} × ${formatNumber(m.width, 1)}`,
      unite: 'm',
      aide: `Le rectangle qui entoure le contour, grand côté à ${formatNumber(m.azimuth % 180, 0)}° du nord. Le bâtiment en occupe ${formatNumber(m.rectangularity * 100, 0)} %.`,
    },
    { label: 'Tour', valeur: formatNumber(m.perimeter, 1), unite: 'm', aide: 'La longueur du contour, côté après côté.' },
    {
      label: 'Hauteur',
      valeur: formatNumber(b.hauteur, 1),
      unite: 'm',
      aide: b.hauteur === DEFAULT_HEIGHT ? 'Valeur par défaut, à régler à l’étape 2.' : 'Hauteur sous toiture, à vérifier sur la 3D à l’étape 2.',
    },
    // Sur un seul niveau, le plancher vaut la surface au sol affichée en grand : inutile de le redire.
    ...(b.niveaux > 1
      ? [{ label: 'Plancher', valeur: formatNumber(Math.round(m.floorArea)), unite: 'm²', aide: `Surface de plancher estimée, sur ${niveaux}.` }]
      : []),
    {
      label: 'Volume',
      valeur: formatNumber(Math.round(m.volume)),
      unite: 'm³',
      aide: `Surface au sol multipliée par la hauteur. Bâtiment sur ${niveaux}.`,
    },
    {
      label: 'Source',
      valeur: b.rnb ? (
        <a href={`https://rnb.beta.gouv.fr/carte?q=${encodeURIComponent(b.rnb)}`} target="_blank" rel="noopener noreferrer" className="loc-source-lien" title={`Fiche RNB ${b.rnb}`}>
          {source}
        </a>
      ) : (
        source
      ),
      aide: `${SOURCE[b.source]}${b.usage ? `, usage ${b.usage}` : ''}. ${b.rnb ? `Identifiant RNB ${b.rnb} : le lien ouvre sa fiche.` : ''}`.trim(),
    },
  ];
}

export function SurfaceCard({ b, m, direct = false, style }: { b: Batiment; m: BuildingMeasure; direct?: boolean; style?: CSSProperties }) {
  const prec = precisionLabel(m.area ? m.sigma / m.area : 1);
  const lu = lirePrecision(m.area, m.sigma);
  return (
    <section className="loc-surface entree" style={style} data-guide="surface" aria-labelledby="loc-surface-titre">
      <TitreCarte
        id="loc-surface-titre"
        titre="Surface au sol"
        terme="emprise"
        aide={`Calculée sur la forme réelle de la Terre (ellipsoïde WGS84), pas sur une carte à plat. Chaque coin est précis à ${formatNumber(b.precisionSource ?? 0, 1)} m pour la source, plus finement s’il a été replacé à la main.`}
        actions={
          <span className="chip truncate" title={b.nom}>
            {b.nom}
          </span>
        }
      />
      <div className="loc-surface-valeur">
        <b>
          <AnimatedNumber value={Math.round(m.area)} format={formatSurface} duree={direct ? SANS_DELAI_MS : MONTEE_MS} />
        </b>
        <small>m²</small>
      </div>
      <div className="loc-precision">
        <span className={`loc-precision-mot ton-${prec.ton}`}>
          <TonGlyph ton={prec.ton} />
          <InfoTip label="Ce que veut dire la précision" texte={`Précision : ${prec.label.toLowerCase()}`}>
          <p>
            Écart probable : {lu.ecart} ({lu.pourcent} de la surface). Deux fois sur trois, la vraie surface est {lu.fourchette}.
          </p>
          <p>
            {prec.ton === 'ok'
              ? 'Assez précis pour la suite.'
              : 'Pour l’affiner : zoomez sur la photo et replacez les coins du contour sur les angles du toit.'}
            </p>
          </InfoTip>
        </span>
      </div>
      <div className={`loc-jauge ton-${prec.ton}`} role="meter" aria-label="Précision de la surface" aria-valuemin={0} aria-valuemax={1} aria-valuenow={prec.score} aria-valuetext={prec.label}>
        <i style={{ transform: `scaleX(${prec.score})` }} />
      </div>
      <ChiffresSecondaires items={mesures(b, m)} label="Autres mesures du bâtiment" className="loc-mesures" />
      <div className="loc-niveaux">
        <NiveauxBatiment b={b} />
      </div>
    </section>
  );
}
