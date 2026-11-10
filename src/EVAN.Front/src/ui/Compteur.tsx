/**
 * Un petit nombre réglé au clic : moins, la valeur, plus. Sert au nombre de niveaux d'un bâtiment. Un bouton arrêté
 * dit pourquoi dans son infobulle (« le dernier étage porte encore une machine »).
 */
import { Minus, Plus } from 'lucide-react';
import './compteur.css';

interface Props {
  valeur: number;
  min: number;
  max: number;
  onChange(v: number): void;
  /** Ce qu'on règle, pour les lecteurs d'écran : « Niveaux du Bâtiment A ». */
  label: string;
  /** Libellés des deux boutons : « Retirer un niveau », « Ajouter un niveau ». */
  moins: string;
  plus: string;
  /** Pourquoi on ne peut pas descendre plus bas, quand ce n'est pas le minimum absolu. */
  raisonMin?: string;
}

export function Compteur({ valeur, min, max, onChange, label, moins, plus, raisonMin }: Props) {
  const auMin = valeur <= min;
  return (
    <div className="compteur" role="group" aria-label={label}>
      <button type="button" className="btn sm icon" disabled={auMin} aria-label={moins} title={auMin && raisonMin ? raisonMin : moins} onClick={() => onChange(valeur - 1)}>
        <Minus />
      </button>
      <output className="num" aria-live="polite">
        {valeur}
      </output>
      <button type="button" className="btn sm icon" disabled={valeur >= max} aria-label={plus} title={plus} onClick={() => onChange(valeur + 1)}>
        <Plus />
      </button>
    </div>
  );
}
