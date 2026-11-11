/**
 * Connexion au compte de son organisation. Le serveur répond la même chose pour un compte inconnu et un mauvais mot de
 * passe ; après plusieurs échecs, il demande d'attendre. Le bouton dit qu'il travaille, l'erreur dit quoi faire, et
 * le focus va au champ à reprendre (le bouton, désactivé pendant l'envoi, l'a perdu).
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { ErreurApi } from '@/api/http';
import { useSession } from '@/store/session';

interface Props {
  /** Arrivée par la déconnexion : le titre prend le focus que le bouton disparu avait. */
  focaliser?: boolean;
}

export function FormulaireConnexion({ focaliser = false }: Props) {
  const [identifiant, setIdentifiant] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const ids = { titre: useId(), erreur: useId() };
  const titre = useRef<HTMLHeadingElement>(null);
  const champIdentifiant = useRef<HTMLInputElement>(null);
  const champMotDePasse = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focaliser) titre.current?.focus();
  }, [focaliser]);

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    if (!identifiant.trim() || !motDePasse) {
      setErreur('Saisissez votre adresse e-mail et votre mot de passe.');
      (identifiant.trim() ? champMotDePasse : champIdentifiant).current?.focus();
      return;
    }
    setEnvoi(true);
    setErreur(undefined);
    try {
      await useSession.getState().connecter(identifiant.trim(), motDePasse);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : 'La connexion n’a pas abouti. Réessayez.');
      setMotDePasse('');
      // Le mot de passe, vidé, est le champ à ressaisir.
      champMotDePasse.current?.focus();
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <form className="cpt-carte" aria-labelledby={ids.titre} onSubmit={(e) => void envoyer(e)} noValidate>
      <h1 id={ids.titre} ref={titre} tabIndex={-1}>
        Se connecter
      </h1>
      <p className="cpt-intro">
        Avec le compte que l’administrateur de votre organisation vous a créé. Vos usines sont alors enregistrées sur le serveur EVAN, pas seulement dans ce
        navigateur.
      </p>
      <label className="field">
        <span>Adresse e-mail</span>
        <input
          ref={champIdentifiant}
          className="input"
          type="email"
          autoComplete="username"
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? ids.erreur : undefined}
          required
        />
      </label>
      <label className="field">
        <span>Mot de passe</span>
        <input
          ref={champMotDePasse}
          className="input"
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={erreur ? ids.erreur : undefined}
          required
        />
      </label>
      {erreur && (
        <p id={ids.erreur} className="cpt-erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="cpt-actions">
        <button type="submit" className="btn primary" disabled={envoi} aria-busy={envoi || undefined}>
          <LogIn aria-hidden /> {envoi ? 'Connexion…' : 'Se connecter'}
        </button>
      </div>
      <p className="cpt-note">Pas encore de compte ? L’administrateur de votre organisation le crée depuis cette page, une fois connecté.</p>
    </form>
  );
}
