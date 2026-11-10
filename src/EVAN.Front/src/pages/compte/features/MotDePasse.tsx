/**
 * Changer son mot de passe (par exemple le mot de passe provisoire reçu de l'administrateur). L'actuel est demandé :
 * une session laissée ouverte sur un poste d'atelier ne suffit pas à le changer.
 */
import { useId, useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { appel, ErreurApi } from '@/api/http';

const MIN = 12;

export function MotDePasse() {
  const [ouvert, setOuvert] = useState(false);
  const [actuel, setActuel] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string>();
  const [fait, setFait] = useState(false);
  const titre = useId();

  const envoyer = async (e: FormEvent) => {
    e.preventDefault();
    setErreur(undefined);
    setFait(false);
    const local: Record<string, string> = {};
    if (!actuel) local.actuel = 'Mot de passe actuel requis.';
    if (nouveau.length < MIN) local.nouveau = `${MIN} caractères au moins.`;
    setChamps(local);
    if (Object.keys(local).length) return;
    setEnvoi(true);
    try {
      await appel('PUT', '/api/session/mot-de-passe', { actuel, nouveau });
      setActuel('');
      setNouveau('');
      setFait(true);
    } catch (err) {
      const e = err instanceof ErreurApi ? err : new ErreurApi(0, 'Changement interrompu.');
      setChamps(Object.fromEntries(e.champs.map((c) => [c.champ, c.message])));
      setErreur(e.champs.length ? undefined : e.message);
    } finally {
      setEnvoi(false);
    }
  };

  if (!ouvert) {
    return (
      <div className="cpt-ligne">
        <button className="btn sm ghost" onClick={() => setOuvert(true)}>
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

  return (
    <form className="cpt-carte" aria-labelledby={titre} onSubmit={(e) => void envoyer(e)} noValidate>
      <h2 id={titre}>Changer mon mot de passe</h2>
      {(['actuel', 'nouveau'] as const).map((c) => (
        <label className="field" key={c}>
          <span>{c === 'actuel' ? 'Mot de passe actuel' : `Nouveau mot de passe (${MIN} caractères au moins)`}</span>
          <input
            className="input"
            type="password"
            autoComplete={c === 'actuel' ? 'current-password' : 'new-password'}
            maxLength={256}
            value={c === 'actuel' ? actuel : nouveau}
            onChange={(e) => (c === 'actuel' ? setActuel : setNouveau)(e.target.value)}
            aria-invalid={champs[c] ? true : undefined}
            aria-describedby={champs[c] ? `${titre}-${c}` : undefined}
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
        <button type="button" className="btn" onClick={() => setOuvert(false)}>
          Fermer
        </button>
      </div>
    </form>
  );
}
