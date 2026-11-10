/**
 * Le temps de relire l'organisation d'un compte sur le serveur : le logo et une phrase. En cas d'échec, la raison et
 * de quoi repartir. On ne retombe pas sur la copie du navigateur : elle pourrait écraser l'usine du serveur.
 */
import { Link } from 'react-router';
import { Home, LogIn, RefreshCw } from 'lucide-react';
import { EvanLogo } from '@/ui/EvanLogo';

interface Props {
  erreur?: { message: string; statut: number };
  reessayer(): void;
}

export function ChargementServeur({ erreur, reessayer }: Props) {
  if (!erreur) {
    return (
      <div className="hors-route chargement" role="status" aria-live="polite">
        <div className="hr-contenu">
          <EvanLogo size={34} pulse />
          <p className="hr-phrase">Chargement de votre organisation…</p>
          <span className="hr-barre" aria-hidden>
            <i />
          </span>
        </div>
      </div>
    );
  }
  return (
    <div role="alert" className="hors-route">
      <div className="hr-contenu entree">
        <EvanLogo size={30} status="warn" />
        <p className="hr-code">Serveur EVAN</p>
        <h1>Votre organisation n’a pas pu être chargée</h1>
        <p className="hr-texte">{erreur.message}</p>
        <div className="hr-actions">
          {erreur.statut === 401 ? (
            <Link to="/compte" className="btn primary">
              <LogIn aria-hidden /> Se reconnecter
            </Link>
          ) : (
            <button className="btn primary" onClick={reessayer}>
              <RefreshCw aria-hidden /> Réessayer
            </button>
          )}
          <Link to="/" className="btn">
            <Home aria-hidden /> Retour à l’accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
