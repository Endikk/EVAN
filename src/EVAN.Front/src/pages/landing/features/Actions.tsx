/** Les deux actions de l'accueil : la démo, ou son usine. Reprises au pied du volet « Comment ça marche ». */
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';

interface Props {
  assistantTo: string;
  saved: boolean;
}

export function Actions({ assistantTo, saved }: Props) {
  return (
    <>
      <Link to="/demo" className="lp-btn lp-btn-plein">
        Voir la démo
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
      <Link to={assistantTo} className="lp-btn lp-btn-contour">
        {saved ? 'Reprendre mon usine' : 'Commencer avec mon usine'}
      </Link>
    </>
  );
}
