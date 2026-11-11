/**
 * Administrateur : les comptes de l'organisation, la création d'un compte, et sur chaque autre ligne le retrait et le
 * mot de passe provisoire (LigneMembre). Chaque refus du serveur s'affiche sous le champ qu'il concerne (adresse déjà
 * prise, mot de passe trop court…), et le focus va au premier champ à corriger.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { appel, ErreurApi } from '@/api/http';
import { useSession, type Role } from '@/store/session';
import { estSoi, sansMembre, type Membre } from '../lib/membres';
import { LigneMembre } from './LigneMembre';

const MOT_DE_PASSE_MIN = 12;
const vide = { identifiant: '', nom: '', motDePasse: '', role: 'membre' as Role };
type Champ = keyof typeof vide;
/** Ordre des champs dans le formulaire : le focus va au premier refusé. */
const ORDRE: Champ[] = ['nom', 'identifiant', 'motDePasse', 'role'];

interface Props {
  /** Création, retrait ou mot de passe provisoire réussi : la ligne s'ajoute au journal des comptes. */
  aAgi?: () => void;
}

export function Membres({ aAgi }: Props) {
  const moi = useSession((s) => s.utilisateur?.identifiant);
  const [membres, setMembres] = useState<Membre[] | null>(null);
  const [lecture, setLecture] = useState<string>();
  const [annonce, setAnnonce] = useState<{ texte: string; ton: 'succes' | 'note' }>();
  const [saisie, setSaisie] = useState(vide);
  const [envoi, setEnvoi] = useState(false);
  const [champs, setChamps] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string>();
  const [cree, setCree] = useState<string>();
  const titre = useId();
  const id = (champ: string) => `${titre}-${champ}`;
  const entete = useRef<HTMLHeadingElement>(null);

  const lire = () =>
    appel<Membre[]>('GET', '/api/organisation/membres').then(
      (liste) => {
        setMembres(liste);
        setLecture(undefined);
      },
      (err: unknown) => setLecture(err instanceof ErreurApi ? err.message : 'Liste indisponible.'),
    );
  useEffect(() => void lire(), []);

  /** Liste périmée : la ligne qui portait le message va disparaître, l'annonce le reprend au-dessus de la liste. */
  const relire = (message: string) => {
    setAnnonce({ texte: message, ton: 'note' });
    entete.current?.focus();
    void lire();
  };

  /** Focus sur le premier champ refusé, dans l'ordre du formulaire. */
  const allerAuChamp = (refuses: Record<string, string>) => {
    const premier = ORDRE.find((c) => refuses[c]);
    if (premier) document.getElementById(`${id(premier)}-saisie`)?.focus();
  };

  const retire = (m: Membre) => {
    setMembres((liste) => (liste ? sansMembre(liste, m.id) : liste));
    setAnnonce({ texte: `${m.nom} ne fait plus partie de l’organisation.`, ton: 'succes' });
    aAgi?.();
    // La ligne et ses boutons disparaissent : le focus revient au titre de la liste, que suit l'annonce.
    entete.current?.focus();
  };

  const creer = async (e: FormEvent) => {
    e.preventDefault();
    setCree(undefined);
    setErreur(undefined);
    // Vérification d'avance de ce qui se voit à la saisie ; le serveur vérifie tout de nouveau.
    const local: Record<string, string> = {};
    if (!saisie.nom.trim()) local.nom = 'Nom requis : il signe les acquittements et les interventions.';
    if (!saisie.identifiant.trim()) local.identifiant = 'Adresse e-mail requise.';
    if (saisie.motDePasse.length < MOT_DE_PASSE_MIN) local.motDePasse = `${MOT_DE_PASSE_MIN} caractères au moins.`;
    setChamps(local);
    if (Object.keys(local).length) {
      allerAuChamp(local);
      return;
    }
    setEnvoi(true);
    try {
      const membre = await appel<Membre>('POST', '/api/organisation/membres', { ...saisie, identifiant: saisie.identifiant.trim(), nom: saisie.nom.trim() });
      setCree(`Compte créé pour ${membre.nom} (${membre.identifiant}). Transmettez-lui son mot de passe de vive voix, jamais par e-mail.`);
      setSaisie(vide);
      void lire();
      aAgi?.();
    } catch (err) {
      const e = err instanceof ErreurApi ? err : new ErreurApi(0, 'Création interrompue.');
      const refuses = Object.fromEntries(e.champs.map((c) => [c.champ, c.message]));
      setChamps(refuses);
      setErreur(e.message);
      allerAuChamp(refuses);
    } finally {
      setEnvoi(false);
    }
  };

  const champ = (nom: Champ, libelle: string, props: Record<string, unknown>) => (
    <label className="field">
      <span>{libelle}</span>
      <input
        id={`${id(nom)}-saisie`}
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
      <h2 id={titre} ref={entete} tabIndex={-1}>
        Membres de l’organisation
      </h2>
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
      {/* Toujours présente, même vide : une zone d'annonce ajoutée en même temps que son texte n'est pas toujours lue. */}
      <div className="cpt-annonce" role="status">
        {annonce && <p className={annonce.ton === 'succes' ? 'cpt-succes' : 'cpt-note'}>{annonce.texte}</p>}
      </div>
      {membres && (
        <ul className="cpt-liste">
          {membres.map((m) => (
            <LigneMembre key={m.id} membre={m} soi={estSoi(m, moi)} retire={retire} relire={relire} provisoireDonne={aAgi} />
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
          <select
            id={`${id('role')}-saisie`}
            className="input"
            value={saisie.role}
            onChange={(e) => setSaisie({ ...saisie, role: e.target.value as Role })}
            aria-invalid={champs.role ? true : undefined}
            aria-describedby={champs.role ? id('role') : undefined}
          >
            <option value="membre">Membre : supervise et configure les usines</option>
            <option value="admin">Administrateur : gère les comptes, reçoit la configuration des passerelles</option>
          </select>
          {champs.role && (
            <small id={id('role')} className="cpt-champ-erreur">
              {champs.role}
            </small>
          )}
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
