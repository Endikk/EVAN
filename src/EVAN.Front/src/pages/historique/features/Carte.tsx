/**
 * Une carte de l'historique : son titre et son « ? » (comment lire le graphique), une ligne qui en tire la leçon,
 * puis le graphique. L'entrée en cascade (.entree) est portée par la cellule de la grille, et le repère du guide
 * (data-guide) par la carte elle-même : quand le guide désigne la carte, son halo ne relance pas l'entrée.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { TitreCarte, type TermeCle } from '@/ui/explain';

interface Props {
  titre: string;
  /** Comment lire le graphique, ce qu'il compte, les gestes possibles : dans le « ? ». */
  aide?: ReactNode;
  /** Mot du métier expliqué dans le même « ? ». */
  terme?: TermeCle;
  /** La leçon du graphique, calculée : une ligne. */
  lecon?: ReactNode;
  /** Largeur sur 12 colonnes (écran large). */
  span: 4 | 5 | 6 | 7 | 8 | 12;
  /** Rang dans l'entrée en cascade. */
  rang: number;
  guide?: string;
  /** Repère de la visite guidée. */
  tour?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Carte({ titre, aide, terme, lecon, span, rang, guide, tour, actions, className = '', children }: Props) {
  const id = useId();
  return (
    <div className={`hist-cellule span-${span} entree`} style={{ '--i': rang } as CSSProperties}>
      <section className={`card hist-carte ${className}`} data-guide={guide} data-tour={tour} aria-labelledby={id}>
        <TitreCarte titre={titre} aide={aide} terme={terme} lecon={lecon} actions={actions} id={id} />
        {children}
      </section>
    </div>
  );
}
