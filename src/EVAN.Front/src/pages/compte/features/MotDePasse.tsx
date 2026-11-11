/**
 * Changer son mot de passe (par exemple le mot de passe provisoire reçu de l'administrateur). L'actuel est demandé :
 * une session laissée ouverte sur un poste d'atelier ne suffit pas à le changer. Le serveur ferme alors les autres
 * sessions du compte et rouvre celle-ci.
 * Après un mot de passe provisoire (`force`), le formulaire s'ouvre d'emblée et ne se ferme pas : le serveur ne
 * permet rien d'autre tant que le provisoire n'est pas remplacé. Une fois changé, la session est relue et la page
 * retrouve tout le reste.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { appel, ErreurApi } from '@/api/http';
import { useSession } from '@/store/session';

const MIN = 12;

interface Props {
  /** Mot de passe provisoire à remplacer avant tout le reste. */
  force?: boolean;
  /** Mot de passe changé : la ligne s'ajoute au journal des comptes. */
  aChange?: () => void;
}

export function MotDePasse({ force = false, aChange }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string>();
  const [fait, setFait] = useState(false);
  const titre = useId();
  const pourquoi = useId();
  const saisies = { actuel: useRef<HTMLInputElement>(null), nouveau: useRef<HTMLInputElement>(null) };
  const bascule = useRef<HTMLButtonElement>(null);
  /** Le formulaire se referme par « Fermer » ou après le changement forcé : le focus revient au bouton. */
  const ferme = useRef(false);
  const affiche = ouvert || force;
  // Ouverture (ou arrivée avec un provisoire) : le focus va au premier champ. Fermeture : il revient au bouton.
  useEffect(() => {
    if (affiche) saisies.actuel.current?.focus();
    else if (ferme.current) bascule.current?.focus();
    ferme.current = false;
  }, [affiche]);

  /** Focus sur le premier champ refusé (actuel avant nouveau). */
  const allerAuChamp = (refuses: Record<string, string>) => {
    const premier = (['actuel', 'nouveau'] as const).find((c) => refuses[c]);
    if (premier) saisies[premier].current?.focus();
  };

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(undefined);
    setFait(false);
    const local: Record<string, string> = {};
    if (!actuel) local.actuel = force ? 'Mot de passe provisoire requis.' : 'Mot de passe actuel requis.';
    if (nouveau.length < MIN) local.nouveau = `${MIN} caractères au moins.`;
    setChamps(local);
    if (Object.keys(local).length) {
      allerAuChamp(local);
      return;
    }
    setEnvoi(true);
    try {
      await appel('PUT', '/api/session/mot-de-passe', { actuel, nouveau });
      setActuel('');
      setNouveau('');
      setFait(true);
      aChange?.();
      if (force) {
        // Le serveur a rouvert la session sans l'obligation : la relire rend la page entière.
        ferme.current = true;
        await useSession.getState().verifier(true);
      }
    } catch (err) {
      const e = err instanceof ErreurApi ? err : new ErreurApi(0, 'Changement interrompu.');
      const refuses = Object.fromEntries(e.champs.map((c) => [c.champ, c.message]));
      setChamps(refuses);
      setErreur(e.champs.length ? undefined : e.message);
      allerAuChamp(refuses);
    } finally {
      setEnvoi(false);
    }
  };

  if (!affiche) {
    return (
      <div className="cpt-ligne">
        <button ref={bascule} className="btn sm ghost" onClick={() => setOuvert(true)}>
          <KeyRound aria-hidden /> Changer mon mot de passe
        </button>
        {fait && (
          <span className="cpt-succes" role="status">
            Mot de passe changé.
          </span>
        )}
      </div>
    );
  }

  const libelle = (c: 'actuel' | 'nouveau') =>
    c === 'nouveau' ? `Nouveau mot de passe (${MIN} caractères au moins)` : force ? 'Mot de passe provisoire' : 'Mot de passe actuel';

  return (
    <form className="cpt-carte" aria-labelledby={titre} onSubmit={(e) => void envoyer(e)} noValidate>
      <h2 id={titre}>{force ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}</h2>
      {force && (
        <p id={pourquoi} className="cpt-intro">
          Un administrateur vous a donné un mot de passe provisoire. Remplacez-le par le vôtre pour continuer : EVAN ne permet rien d’autre avant, et le
          provisoire cesse de marcher 72 h après sa création.
        </p>
      )}
      {(['actuel', 'nouveau'] as const).map((c) => (
        <label className="field" key={c}>
          <span>{libelle(c)}</span>
          <input
            ref={saisies[c]}
            className="input"
            type="password"
            autoComplete={c === 'actuel' ? 'current-password' : 'new-password'}
            maxLength={256}
            value={c === 'actuel' ? actuel : nouveau}
            onChange={(e) => (c === 'actuel' ? setActuel : setNouveau)(e.target.value)}
            aria-invalid={champs[c] ? true : undefined}
            aria-describedby={[champs[c] ? `${titre}-${c}` : '', force && c === 'actuel' ? pourquoi : ''].filter(Boolean).join(' ') || undefined}
          />
          {champs[c] && (
            <small id={`${titre}-${c}`} className="cpt-champ-erreur">
              {champs[c]}
            </small>
          )}
        </label>
      ))}
      {erreur && (
        <p className="cpt-erreur" role="alert">
          {erreur}
        </p>
      )}
      {fait && (
        <p className="cpt-succes" role="status">
          Mot de passe changé.
        </p>
      )}
      <div className="cpt-actions">
        <button type="submit" className="btn primary" disabled={envoi} aria-busy={envoi || undefined}>
          {envoi ? 'Enregistrement…' : 'Changer le mot de passe'}
        </button>
        {!force && (
          <button
            type="button"
            className="btn"
            onClick={() => {
              ferme.current = true;
              setOuvert(false);
            }}
          >
            Fermer
          </button>
        )}
      </div>
    </form>
  );
}
