/** Qui est connecté, à quelle organisation, avec quel rôle ; l'accès à ses usines et la déconnexion. */
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, LogOut } from 'lucide-react';
import { ErreurApi } from '@/api/http';
import { useSession } from '@/store/session';

const ROLES = { admin: 'Administrateur', membre: 'Membre' } as const;

interface Props {
  /** Arrivée par la connexion : le titre prend le focus que le formulaire disparu avait. */
  focaliser?: boolean;
  /** Mot de passe provisoire à changer : pas d'accès aux usines avant. */
  restreinte?: boolean;
}

export function Session({ focaliser = false, restreinte = false }: Props) {
  const utilisateur = useSession((s) => s.utilisateur);
  const organisation = useSession((s) => s.organisation);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const titre = useId();
  const entete = useRef<HTMLHeadingElement>(null);
  const deconnexion = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focaliser) entete.current?.focus();
  }, [focaliser]);
  // Déconnexion refusée : le bouton, désactivé pendant l'envoi, a perdu le focus ; il le retrouve une fois réactivé.
  useEffect(() => {
    if (erreur && !envoi) deconnexion.current?.focus();
  }, [erreur, envoi]);
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
      <h1 id={titre} ref={entete} tabIndex={-1}>
        {utilisateur.nom}
      </h1>
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
        {!restreinte && (
          <Link to="/assistant" className="btn primary">
            Ouvrir mes usines <ArrowRight aria-hidden />
          </Link>
        )}
        <button ref={deconnexion} className="btn" onClick={() => void deconnecter()} disabled={envoi} aria-busy={envoi || undefined}>
          <LogOut aria-hidden /> {envoi ? 'Déconnexion…' : 'Se déconnecter'}
        </button>
      </div>
      <p className="cpt-note">La déconnexion ferme votre session sur tous les postes où elle est ouverte.</p>
    </section>
  );
}
