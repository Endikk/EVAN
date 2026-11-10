/**
 * Petites scènes animées qui montrent le geste à faire, sans un mot : taper l'adresse, cliquer sur le toit, replacer
 * un coin du contour. Elles tournent quelques fois puis s'arrêtent sur le geste accompli (CSS seul, transform,
 * opacity et tracé). Animations réduites : seule l'image finale s'affiche.
 */
import { useId, type CSSProperties } from 'react';

/** Pointeur de souris, dessiné pointe en (0, 0). */
const SOURIS = 'M0 0V11.5L3.1 8.8 5.2 13.4 7.3 12.5 5.2 8H9.4Z';

interface Props {
  /** Décalage de départ, pour enchaîner deux scènes (la seconde attend que la première ait montré son geste). */
  decalage?: number;
  className?: string;
}

function style(decalage?: number): CSSProperties | undefined {
  return decalage ? ({ ['--loc-g-decalage' as string]: `${decalage}ms` } as CSSProperties) : undefined;
}

/** Taper l'adresse dans la barre, puis choisir le résultat. */
export function GesteAdresse({ decalage, className = '' }: Props) {
  const clip = useId();
  return (
    <svg className={`loc-geste loc-g-adresse ${className}`} viewBox="0 0 120 72" style={style(decalage)} aria-hidden>
      <rect className="loc-g-sol" width="120" height="72" rx="8" />
      <rect className="loc-g-toit" x="72" y="48" width="34" height="16" rx="1" />
      <rect className="loc-g-toit" x="12" y="50" width="22" height="14" rx="1" />
      <rect className="loc-g-champ" x="8" y="8" width="104" height="18" rx="6" />
      <circle className="loc-g-loupe" cx="16" cy="16.6" r="2.6" />
      <path className="loc-g-loupe" d="M18 18.6 20 20.6" />
      <clipPath id={clip}>
        <rect x="22" y="10" width="86" height="14" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <text className="loc-g-texte" x="23" y="20">
          Rue de l’Industrie
        </text>
        <rect className="loc-g-cache" x="22" y="10" width="86" height="14" />
      </g>
      <rect className="loc-g-caret" x="22.6" y="11.5" width="0.9" height="10" />
      <g className="loc-g-resultat">
        <rect className="loc-g-champ" x="8" y="29" width="104" height="15" rx="5" />
        <rect className="loc-g-choisi" x="8" y="29" width="104" height="15" rx="5" />
        <circle className="loc-g-epingle" cx="16" cy="36.5" r="2.4" />
        <rect className="loc-g-ligne" x="22" y="35" width="56" height="3" rx="1.5" />
      </g>
      <path className="loc-g-souris loc-g-souris-adresse" d={SOURIS} />
    </svg>
  );
}

/** Cliquer sur le toit de l'usine : le contour se trace, la surface apparaît. */
export function GesteToit({ decalage, className = '' }: Props) {
  const toit = 'M44 12H80V50H62V42H44Z';
  return (
    <svg className={`loc-geste loc-g-toit-clic ${className}`} viewBox="0 0 120 72" style={style(decalage)} aria-hidden>
      <rect className="loc-g-sol" width="120" height="72" rx="8" />
      <rect className="loc-g-route" y="57" width="120" height="7" />
      <rect className="loc-g-toit" x="10" y="12" width="26" height="18" rx="1" />
      <rect className="loc-g-toit" x="88" y="10" width="22" height="38" rx="1" />
      <path className="loc-g-toit" d={toit} />
      <path className="loc-g-rempli" d={toit} />
      <path className="loc-g-contour" d={toit} pathLength={100} />
      <circle className="loc-g-onde" cx="60" cy="27" r="9" />
      <g className="loc-g-etiquette">
        <rect x="49" y="21" width="22" height="11" rx="3" />
        <text x="60" y="29" textAnchor="middle">
          m²
        </text>
      </g>
      <path className="loc-g-souris loc-g-souris-toit" d={SOURIS} />
    </svg>
  );
}

/** Replacer un coin du contour sur le bord du toit. */
export function GesteCoin({ className = '' }: Props) {
  return (
    <svg className={`loc-geste loc-g-coin ${className}`} viewBox="0 0 120 72" aria-hidden>
      <rect className="loc-g-sol" width="120" height="72" rx="8" />
      <rect className="loc-g-toit" x="30" y="12" width="60" height="46" rx="1" />
      <path className="loc-g-faux" d="M30 12H90L102 66 30 58Z" />
      <path className="loc-g-juste" d="M30 12H90V58H30Z" />
      <circle className="loc-g-sommet" cx="30" cy="12" r="2.6" />
      <circle className="loc-g-sommet" cx="90" cy="12" r="2.6" />
      <circle className="loc-g-sommet" cx="30" cy="58" r="2.6" />
      <circle className="loc-g-sommet loc-g-sommet-tire" cx="102" cy="66" r="3.2" />
      <path className="loc-g-souris loc-g-souris-coin" d={SOURIS} />
    </svg>
  );
}
