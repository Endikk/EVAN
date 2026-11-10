/**
 * Logo EVAN : « evan » suivi de son point d'état. `size` vaut la taille de police équivalente (px).
 * Le mot prend la couleur du texte ; le point passe au orange ou au rouge avec l'atelier.
 */
import { DOT, WORD_PATH, WORD_VIEWBOX, type BrandStatus } from './brand';

interface Props {
  size?: number;
  status?: BrandStatus;
  /** Halo qui respire autour du point. */
  pulse?: boolean;
  className?: string;
}

export function EvanLogo({ size = 30, status = 'ok', pulse = false, className }: Props) {
  return (
    <svg
      className={`evan-logo st-${status} ${pulse ? 'is-pulse' : ''} ${className ?? ''}`}
      width={(size * 2468) / 1000}
      height={(size * 626) / 1000}
      viewBox={WORD_VIEWBOX}
      aria-hidden="true"
    >
      <path d={WORD_PATH} fill="currentColor" />
      <circle className="evan-logo-halo" cx={DOT.cx} cy={DOT.cy} r={DOT.halo} />
      <circle className="evan-logo-dot" cx={DOT.cx} cy={DOT.cy} r={DOT.r} />
    </svg>
  );
}
