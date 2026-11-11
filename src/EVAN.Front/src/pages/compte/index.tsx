/**
 * Compte : se connecter à son organisation, voir qui est connecté, se déconnecter. Un administrateur y crée les
 * comptes de son organisation, relit le journal de ces comptes et récupère la configuration de ses passerelles. Sans serveur EVAN (démo dans le
 * navigateur seul), il n'y a pas de compte : la page le dit et renvoie vers la démo ou l'assistant local.
 * (L'étape 5 « connexion des machines » est une autre page : pages/connexion.)
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Home, PlayCircle } from 'lucide-react';
import { EvanLogo } from '@/ui/EvanLogo';
import { setTabPage } from '@/ui/brand';
import { useSession } from '@/store/session';
import { FormulaireConnexion } from './features/FormulaireConnexion';
import { Session } from './features/Session';
import { MotDePasse } from './features/MotDePasse';
import { Membres } from './features/Membres';
import { JournalComptes } from './features/JournalComptes';
import { Passerelles } from './features/Passerelles';
import './index.css';

/**
 * Sans serveur, ce n'est pas un formulaire mais un état : il se présente comme les autres pages hors des écrans
 * (l'adresse inconnue, l'erreur), une étiquette, le titre, l'explication, de quoi repartir.
 */
function SansServeur() {
  return (
    <section className="cpt-etat" aria-labelledby="cpt-sans-serveur">
      <p className="hr-code">Compte</p>
      <h1 id="cpt-sans-serveur">Pas de serveur EVAN</h1>
      <p className="hr-texte">
        Les comptes vivent sur le serveur EVAN, qui ne répond pas ici. La démonstration et l’assistant marchent sans compte : l’usine que vous décrivez reste
        alors dans ce navigateur.
      </p>
      <div className="hr-actions">
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
  // Mot de passe provisoire pas encore changé : le serveur refuse tout le reste, la page n'offre que le changement.
  const doitChanger = useSession((s) => s.utilisateur?.doitChanger === true);
  // Connexion ou déconnexion depuis cette page : le formulaire ou la fiche qui avait le focus disparaît. Le titre de
  // ce qui le remplace le reçoit, sinon le focus tombe sur la page et le lecteur d'écran ne dit rien.
  const precedent = useRef(etat);
  const [transition, setTransition] = useState(false);
  useEffect(() => {
    const avant = precedent.current;
    precedent.current = etat;
    if ((avant === 'anonyme' && etat === 'connecte') || (avant === 'connecte' && etat === 'anonyme')) setTransition(true);
  }, [etat]);

  // Une action sur les comptes faite ici (création, retrait, mot de passe) s'inscrit au journal : il est relu.
  const [journal, setJournal] = useState(0);
  const relireJournal = () => setJournal((n) => n + 1);

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
        {etat === 'anonyme' && <FormulaireConnexion focaliser={transition} />}
        {etat === 'connecte' && (
          <>
            <Session focaliser={transition && !doitChanger} restreinte={doitChanger} />
            <MotDePasse force={doitChanger} aChange={relireJournal} />
            {admin && !doitChanger && <Membres aAgi={relireJournal} />}
            {admin && !doitChanger && <JournalComptes version={journal} />}
            {admin && !doitChanger && <Passerelles />}
          </>
        )}
      </div>
    </main>
  );
}
