/** Qui est connecté, à quelle organisation, avec quel rôle ; l'accès à ses usines et la déconnexion. */
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, LogOut } from 'lucide-react';
import { ErreurApi } from '@/api/http';
import { useSession } from '@/store/session';

const ROLES = { admin: 'Administrateur', membre: 'Membre' } as const;

export function Session() {
  const utilisateur = useSession((s) => s.utilisateur);
  const organisation = useSession((s) => s.organisation);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const titre = useId();
  if (!utilisateur || !organisation) return null;

  const deconnecter = async () => {
    setEnvoi(true);
    setErreur(undefined);
    try {
      await useSession.getState().deconnecter();
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : 'La déconnexion n’a pas abouti.');
      setEnvoi(false);
    }
  };

  return (
    <section className="cpt-carte" aria-labelledby={titre}>
      <p className="cpt-sur-titre">{organisation.nom}</p>
      <h1 id={titre}>{utilisateur.nom}</h1>
      <dl className="cpt-fiche">
        <div>
          <dt>Adresse e-mail</dt>
          <dd>{utilisateur.identifiant}</dd>
        </div>
        <div>
          <dt>Rôle</dt>
          <dd>{ROLES[utilisateur.role]}</dd>
        </div>
      </dl>
      {erreur && (
        <p className="cpt-erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="cpt-actions">
        <Link to="/assistant" className="btn primary">
          Ouvrir mes usines <ArrowRight aria-hidden />
        </Link>
        <button className="btn" onClick={() => void deconnecter()} disabled={envoi} aria-busy={envoi || undefined}>
          <LogOut aria-hidden /> {envoi ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
    </section>
  );
}
