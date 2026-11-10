/**
 * Petites scènes animées de l'étape 2 : la 3D qui se met à plat en 2D, et le geste pour dessiner une zone (appuyer à
 * un coin, glisser jusqu'au coin opposé, relâcher). CSS seul, quelques tours puis l'image finale.
 */
import type { CSSProperties } from 'react';

/** Pointeur de souris, dessiné pointe en (0, 0). */
const SOURIS = 'M0 0V11.5L3.1 8.8 5.2 13.4 7.3 12.5 5.2 8H9.4Z';

/** La même scène vue en volume puis à plat. */
export function GesteVue({ className = '' }: { className?: string }) {
  return (
    <svg className={`pln-geste pln-g-vue ${className}`} viewBox="0 0 120 72" aria-hidden>
      <rect className="pln-g-fond" width="120" height="72" rx="8" />
      <g className="pln-g-3d">
        <path className="pln-g-face-haut" d="M28 30 60 16 92 30 60 44Z" />
        <path className="pln-g-face-g" d="M28 30 60 44V62L28 48Z" />
        <path className="pln-g-face-d" d="M60 44 92 30V48L60 62Z" />
        <text className="pln-g-mot" x="10" y="15">
          3D
        </text>
      </g>
      <g className="pln-g-2d">
        <path className="pln-g-grille" d="M34 26H86M34 36H86M34 46H86M47 16V56M60 16V56M73 16V56" />
        <rect className="pln-g-plan" x="34" y="16" width="52" height="40" />
        <rect className="pln-g-zone-fixe" x="38" y="20" width="24" height="16" />
        <text className="pln-g-mot" x="10" y="15">
          2D
        </text>
      </g>
    </svg>
  );
}

/** Dessiner une zone : appuyer à un coin, glisser, relâcher. `couleur` : celle du type choisi. */
export function GesteZone({ couleur, className = '' }: { couleur?: string; className?: string }) {
  const style = couleur ? ({ ['--pln-c' as string]: couleur } as CSSProperties) : undefined;
  return (
    <svg className={`pln-geste pln-g-zone ${className}`} viewBox="0 0 120 72" style={style} aria-hidden>
      <rect className="pln-g-fond" width="120" height="72" rx="8" />
      <path className="pln-g-grille" d="M10 22H110M10 36H110M10 50H110M24 8V64M44 8V64M64 8V64M84 8V64M104 8V64" />
      <rect className="pln-g-plan" x="10" y="8" width="100" height="56" />
      <rect className="pln-g-rect" x="28" y="16" width="56" height="36" />
      <rect className="pln-g-cote" x="45" y="55" width="22" height="7" rx="2" />
      <circle className="pln-g-appui" cx="28" cy="16" r="5" />
      <path className="pln-g-souris pln-g-souris-zone" d={SOURIS} />
    </svg>
  );
}
