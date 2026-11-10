/**
 * Ce qui n'est pas nécessaire pour comprendre reste replié : « Voir les chiffres détaillés ». Le contenu n'est
 * construit qu'à la première ouverture (graphiques compris), puis gardé.
 */
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  titre: ReactNode;
  /** Ce qu'on trouvera en ouvrant, en quelques mots. */
  apercu?: ReactNode;
  ouvert?: boolean;
  children: ReactNode;
  className?: string;
}

export function Details({ titre, apercu, ouvert: initial = false, children, className = '' }: Props) {
  const [ouvert, setOuvert] = useState(initial);
  const [monte, setMonte] = useState(initial);
  const id = useId();
  return (
    <div className={`details ${ouvert ? 'ouvert' : ''} ${className}`}>
      <button
        type="button"
        className="details-tete"
        aria-expanded={ouvert}
        aria-controls={id}
        onClick={() => {
          setMonte(true);
          setOuvert((v) => !v);
        }}
      >
        <ChevronDown aria-hidden />
        <span className="details-titre">{titre}</span>
        {apercu && !ouvert && <span className="details-apercu">{apercu}</span>}
      </button>
      <div className="details-corps" id={id} role="region" aria-hidden={!ouvert} inert={!ouvert}>
        <div className="details-interieur">{monte && children}</div>
      </div>
    </div>
  );
}
