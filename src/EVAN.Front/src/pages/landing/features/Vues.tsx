/**
 * Les trois vues de la presse, en un seul contrôle : l'ensemble qui tourne, la panne qu'on provoque (la presse
 * s'arrête, EVAN montre la pièce et ce qu'il faut vérifier), les pièces surveillées. Un curseur glisse sous la vue
 * choisie.
 */
import type { CSSProperties, Ref } from 'react';
import { VUES, type VueId } from '../lib/sections';

interface Props {
  vue: VueId;
  onChange(v: VueId): void;
  /** Téléphone ou écran moyen : les libellés courts. */
  court: boolean;
  /** La page mesure le contrôle : la caméra garde la presse au-dessus. */
  ref?: Ref<HTMLDivElement>;
  /** Le segment de la panne, mesuré par le film d'ouverture. */
  panneRef?: Ref<HTMLButtonElement>;
  className?: string;
  style?: CSSProperties;
}

export function Vues({ vue, onChange, court, ref, panneRef, className = '', style }: Props) {
  const i = Math.max(0, VUES.findIndex((v) => v.id === vue));
  return (
    <div
      ref={ref}
      className={`lp-vues ${className}`}
      style={{ ...style, '--n': VUES.length, '--i-vue': i } as CSSProperties}
      role="group"
      aria-label="Voir sur la presse"
    >
      <span className={`lp-vues-curseur ${vue === 'panne' ? 'is-crit' : ''}`} aria-hidden="true" />
      {VUES.map((v) => (
        <button
          key={v.id}
          ref={v.id === 'panne' ? panneRef : undefined}
          type="button"
          aria-pressed={vue === v.id}
          className={`lp-vue ${vue === v.id ? 'on' : ''} ${v.id === 'panne' ? 'is-crit' : ''}`}
          onClick={() => onChange(v.id)}
        >
          <v.icon aria-hidden="true" />
          {court ? v.court : v.label}
        </button>
      ))}
    </div>
  );
}
