/**
 * Administrateur : les comptes de l'organisation, et la création d'un compte. Chaque refus du serveur s'affiche sous
 * le champ qu'il concerne (adresse déjà prise, mot de passe trop court…).
 */
import { useEffect, useId, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { appel, ErreurApi } from '@/api/http';
import type { Role } from '@/store/session';

interface Membre {
  id: string;
  identifiant: string;
  nom: string;
  role: Role;
  creeLe: number;
}

const ROLES: Record<Role, string> = { admin: 'Administrateur', membre: 'Membre' };
const MOT_DE_PASSE_MIN = 12;
const vide = { identifiant: '', nom: '', motDePasse: '', role: 'membre' as Role };

export function Membres() {
  const [membres, setMembres] = useState<Membre[] | null>(null);
  const [lecture, setLecture] = useState<string>();
  const [saisie, setSaisie] = useState(vide);
  const [envoi, setEnvoi] = useState(false);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string>();
  const [cree, setCree] = useState<string>();
  const titre = useId();
  const id = (champ: string) => `${titre}-${champ}`;

  const lire = () =>
    appel<Membre[]>('GET', '/api/organisation/membres').then(
      (liste) => {
        setMembres(liste);
        setLecture(undefined);
      },
      (err: unknown) => setLecture(err instanceof ErreurApi ? err.message : 'Liste indisponible.'),
    );
  useEffect(() => void lire(), []);

  const creer = async (e: FormEvent) => {
    e.preventDefault();
    setCree(undefined);
    setErreur(undefined);
    // Vérification d'avance de ce qui se voit à la saisie ; le serveur vérifie tout de nouveau.
    const local: Record<string, string> = {};
    if (!saisie.identifiant.trim()) local.identifiant = 'Adresse e-mail requise.';
    if (!saisie.nom.trim()) local.nom = 'Nom requis : il signe les acquittements et les interventions.';
    if (saisie.motDePasse.length < MOT_DE_PASSE_MIN) local.motDePasse = `${MOT_DE_PASSE_MIN} caractères au moins.`;
    setChamps(local);
    if (Object.keys(local).length) return;
    setEnvoi(true);
    try {
      const membre = await appel<Membre>('POST', '/api/organisation/membres', { ...saisie, identifiant: saisie.identifiant.trim(), nom: saisie.nom.trim() });
      setCree(`Compte créé pour ${membre.nom} (${membre.identifiant}). Transmettez-lui son mot de passe de vive voix, jamais par e-mail.`);
      setSaisie(vide);
      void lire();
    } catch (err) {
      const e = err instanceof ErreurApi ? err : new ErreurApi(0, 'Création interrompue.');
      setChamps(Object.fromEntries(e.champs.map((c) => [c.champ, c.message])));
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  };

  const champ = (nom: keyof typeof vide, libelle: string, props: Record<string, unknown>) => (
    <label className="field">
      <span>{libelle}</span>
      <input
        className="input"
        value={saisie[nom]}
        onChange={(e) => setSaisie({ ...saisie, [nom]: e.target.value })}
        aria-invalid={champs[nom] ? true : undefined}
        aria-describedby={champs[nom] ? id(nom) : undefined}
        {...props}
      />
      {champs[nom] && (
        <small id={id(nom)} className="cpt-champ-erreur">
          {champs[nom]}
        </small>
      )}
    </label>
  );

  return (
    <section className="cpt-carte" aria-labelledby={titre}>
      <h2 id={titre}>Membres de l’organisation</h2>
      {lecture && (
        <p className="cpt-erreur" role="alert">
          {lecture}
        </p>
      )}
      {!membres && !lecture && (
        <p className="cpt-note" role="status">
          Chargement des comptes…
        </p>
      )}
      {membres && (
        <ul className="cpt-liste">
          {membres.map((m) => (
            <li key={m.id}>
              <b>{m.nom}</b>
              <span>{m.identifiant}</span>
              <span className={`chip ${m.role === 'admin' ? 'accent' : ''}`}>{ROLES[m.role]}</span>
            </li>
          ))}
        </ul>
      )}

      <form className="cpt-formulaire" onSubmit={(e) => void creer(e)} noValidate aria-label="Créer un compte">
        <h3>Créer un compte</h3>
        {champ('nom', 'Nom', { autoComplete: 'off', maxLength: 80 })}
        {champ('identifiant', 'Adresse e-mail', { type: 'email', autoComplete: 'off', maxLength: 254 })}
        {champ('motDePasse', `Mot de passe provisoire (${MOT_DE_PASSE_MIN} caractères au moins)`, { type: 'password', autoComplete: 'new-password', maxLength: 256 })}
        <label className="field">
          <span>Rôle</span>
          <select className="input" value={saisie.role} onChange={(e) => setSaisie({ ...saisie, role: e.target.value as Role })}>
            <option value="membre">Membre : supervise et configure les usines</option>
            <option value="admin">Administrateur : crée les comptes, reçoit la configuration des passerelles</option>
          </select>
        </label>
        {erreur && (
          <p className="cpt-erreur" role="alert">
            {erreur}
          </p>
        )}
        {cree && (
          <p className="cpt-succes" role="status">
            {cree}
          </p>
        )}
        <div className="cpt-actions">
          <button type="submit" className="btn primary" disabled={envoi} aria-busy={envoi || undefined}>
            <UserPlus aria-hidden /> {envoi ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </form>
    </section>
  );
}
