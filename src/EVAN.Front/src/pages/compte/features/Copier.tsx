/**
 * Copier un texte (mot de passe provisoire, commande de l'exploitant) dans le presse-papiers. Le bouton dit qu'il a
 * copié ; si le navigateur refuse (page hors HTTPS, droit retiré), il le dit aussi et sélectionne le texte, qu'il ne
 * reste qu'à copier au clavier.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Check, Copy } from 'lucide-react';

const DUREE_CONFIRMATION_MS = 2000;

interface Props {
  texte: string;
  /** Ce qui est copié, pour le nom accessible (« Copier la commande »). */
  quoi: string;
  /** Élément qui affiche le texte : sélectionné si la copie échoue. */
  source: RefObject<HTMLElement | null>;
}

function selectionner(el: HTMLElement | null) {
  if (!el) return;
  const plage = document.createRange();
  plage.selectNodeContents(el);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(plage);
}

export function Copier({ texte, quoi, source }: Props) {
  const [etat, setEtat] = useState<'repos' | 'copie' | 'refus'>('repos');
  const minuterie = useRef<number>(undefined);
  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  const copier = async () => {
    window.clearTimeout(minuterie.current);
    try {
      await navigator.clipboard.writeText(texte);
      setEtat('copie');
      minuterie.current = window.setTimeout(() => setEtat('repos'), DUREE_CONFIRMATION_MS);
    } catch {
      selectionner(source.current);
      setEtat('refus');
    }
  };

  return (
    <>
      <button type="button" className="btn sm" onClick={() => void copier()} aria-label={`Copier ${quoi}`}>
        {etat === 'copie' ? <Check aria-hidden /> : <Copy aria-hidden />} {etat === 'copie' ? 'Copié' : 'Copier'}
      </button>
      {/* Réussite : le bouton dit déjà « Copié », l'annonce ne sert qu'aux lecteurs d'écran. Refus : la consigne se voit. */}
      <span className={etat === 'refus' ? 'cpt-copie-etat' : 'sr-only'} role="status">
        {etat === 'copie' && 'Copié dans le presse-papiers.'}
        {etat === 'refus' && 'Copie refusée par le navigateur : le texte est sélectionné, copiez-le au clavier.'}
      </span>
    </>
  );
}
