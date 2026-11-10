/**
 * Compte : se connecter à son organisation, voir qui est connecté, se déconnecter. Un administrateur y crée les
 * comptes de son organisation et récupère la configuration de ses passerelles. Sans serveur EVAN (démo dans le
 * navigateur seul), il n'y a pas de compte : la page le dit et renvoie vers la démo ou l'assistant local.
 * (L'étape 5 « connexion des machines » est une autre page : pages/connexion.)
 */
import { useEffect } from 'react';
import { Link } from 'react-router';
import { Home, PlayCircle } from 'lucide-react';
import { EvanLogo } from '@/ui/EvanLogo';
import { setTabPage } from '@/ui/brand';
import { useSession } from '@/store/session';
import { FormulaireConnexion } from './features/FormulaireConnexion';
import { Session } from './features/Session';
import { MotDePasse } from './features/MotDePasse';
import { Membres } from './features/Membres';
import { Passerelles } from './features/Passerelles';
import './index.css';

function SansServeur() {
  return (
    <section className="cpt-carte">
      <h1>Pas de serveur EVAN</h1>
      <p className="cpt-intro">
        Les comptes vivent sur le serveur EVAN, qui ne répond pas ici. La démonstration et l’assistant marchent sans compte : l’usine que vous décrivez reste
        alors dans ce navigateur.
      </p>
      <div className="cpt-actions">
        <Link to="/demo" className="btn primary">
          <PlayCircle aria-hidden /> Voir la démo
        </Link>
        <Link to="/" className="btn">
          <Home aria-hidden /> Accueil
        </Link>
      </div>
    </section>
  );
}

export function ComptePage() {
  const etat = useSession((s) => s.etat);
  const admin = useSession((s) => s.utilisateur?.role === 'admin');

  useEffect(() => {
    setTabPage('Compte');
    void useSession.getState().verifier(true);
    return () => setTabPage(undefined);
  }, []);

  return (
    <main className="hors-route cpt">
      <div className="cpt-contenu">
        <Link to="/" aria-label="EVAN, accueil" className="hr-logo">
          <EvanLogo size={28} />
        </Link>
        {etat === 'inconnu' && (
          <p className="cpt-note" role="status">
            Vérification de la session…
          </p>
        )}
        {etat === 'sansApi' && <SansServeur />}
        {etat === 'anonyme' && <FormulaireConnexion />}
        {etat === 'connecte' && (
          <>
            <Session />
            <MotDePasse />
            {admin && <Membres />}
            {admin && <Passerelles />}
          </>
        )}
      </div>
    </main>
  );
}
