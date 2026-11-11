/**
 * Les deux actions de l'accueil : la démo, ou son usine. Reprises au pied du volet « Comment ça marche ». Les boutons
 * de l'application, en grand : l'action principale à l'ivoire (l'encre le jour), la seconde en contour. Le second
 * dépend de la session (lib/actions.ts) ; quand il faut savoir quelque chose avant de cliquer, une note le dit dessous.
 */
import { useId } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { ADRESSE_DEMO, type ActionUsine } from '../lib/actions';

interface Props {
  usine: ActionUsine;
}

export function Actions({ usine }: Props) {
  const noteId = useId();
  return (
    <>
      <Link to={ADRESSE_DEMO} className="btn primary lg">
        Voir la démo
        <ArrowRight aria-hidden="true" />
      </Link>
      <Link to={usine.to} className="btn lg" aria-describedby={usine.note ? noteId : undefined}>
        {usine.libelle}
      </Link>
      {usine.note && (
        <p id={noteId} className="lp-note">
          {usine.note}
        </p>
      )}
    </>
  );
}
