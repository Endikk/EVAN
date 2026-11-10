/**
 * Le geste de la pose, montré plutôt que décrit : une machine quitte la bibliothèque, glisse jusqu'au plan, s'aligne
 * sur la grille et reçoit son numéro. Tout est en CSS (transform et opacity) ; la dernière image est la machine posée,
 * c'est donc elle qui reste quand les animations sont réduites ou une fois les boucles jouées.
 */
import { GRID_STEP } from '@/widgets/scene/sceneState';

const GRILLE = Array.from({ length: 15 }, (_, i) => 136 + i * 12);
const LIGNES = Array.from({ length: 8 }, (_, i) => 18 + i * 12);

/** Pas de la grille en centimètres, tel qu'on le dit à l'atelier. */
export const PAS_GRILLE_CM = Math.round(GRID_STEP * 100);

function Glyphe({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width={56} height={20} rx={3} />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={x + 10 + i * 12} cy={y + 10} r={3.4} />
      ))}
    </>
  );
}

export function GesteDepot({ boucles = 'infinite' }: { boucles?: number | 'infinite' }) {
  return (
    <svg
      className="geste-depot"
      viewBox="0 0 320 120"
      role="img"
      aria-label={`Une machine glissée de la bibliothèque jusqu’au plan, où elle s’aligne sur la grille de ${PAS_GRILLE_CM} cm et reçoit son numéro.`}
      style={{ ['--boucles' as string]: boucles }}
    >
      {/* La bibliothèque : une carte de machine. */}
      <g className="gd-carte">
        <rect x={10} y={30} width={88} height={60} rx={10} />
        <g className="gd-glyphe gd-glyphe-carte">
          <Glyphe x={26} y={44} />
        </g>
        <rect className="gd-ligne-texte" x={22} y={72} width={44} height={5} rx={2.5} />
      </g>

      {/* Le plan : une grille, une zone de l'atelier. */}
      <g className="gd-plan">
        <rect className="gd-sol" x={130} y={12} width={182} height={96} rx={8} />
        {GRILLE.map((x) => (
          <line key={`v${x}`} x1={x} y1={14} x2={x} y2={106} />
        ))}
        {LIGNES.map((y) => (
          <line key={`h${y}`} x1={132} y1={y} x2={310} y2={y} />
        ))}
        <rect className="gd-zone" x={180} y={34} width={112} height={58} rx={4} />
      </g>

      {/* Les repères d'aimantation qui s'allument au moment où la machine se cale. */}
      <g className="gd-aimant">
        <line x1={232} y1={14} x2={232} y2={106} />
        <line x1={132} y1={62} x2={310} y2={62} />
      </g>

      {/* La machine une fois posée, avec son numéro. */}
      <g className="gd-posee">
        <g className="gd-glyphe">
          <Glyphe x={204} y={52} />
        </g>
        <g className="gd-etiquette">
          <rect x={214} y={30} width={36} height={16} rx={8} />
          <text x={232} y={41.5} textAnchor="middle">
            R01
          </text>
        </g>
      </g>

      {/* Ce que la main transporte : le fantôme de la machine et le pointeur. */}
      <g className="gd-fantome">
        <g className="gd-glyphe">
          <Glyphe x={24} y={50} />
        </g>
        <path className="gd-pointeur" d="M58 62 58 78 62 74 65.5 81 68 80 64.6 73 70 73Z" />
      </g>
    </svg>
  );
}
