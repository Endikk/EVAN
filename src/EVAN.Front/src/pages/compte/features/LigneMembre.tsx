/**
 * Une ligne de la liste des membres : nom, rôle, adresse, et pour un autre compte que le sien, les deux actions de
 * l'administrateur. Chacune demande confirmation sur la ligne même, avec le mot de passe de l'administrateur que le
 * serveur exige (Échap ou « Annuler » ramène au bouton de départ).
 * Le mot de passe provisoire est tiré par le serveur et ne s'affiche qu'une fois : rien ne le garde après « Terminé ».
 */
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { KeyRound, UserMinus } from 'lucide-react';
import { appel } from '@/api/http';
import { useSession } from '@/store/session';
import { refus, type ActionMembre, type Membre } from '../lib/membres';
import { Copier } from './Copier';

const ROLES = { admin: 'Administrateur', membre: 'Membre' } as const;

interface Props {
  membre: Membre;
  soi: boolean;
  /** Retiré côté serveur : la liste l'enlève et annonce le retrait. */
  retire: (m: Membre) => void;
  /** Liste périmée (compte disparu entre-temps) : la relire, en annonçant pourquoi. */
  relire: (message: string) => void;
  /** Mot de passe provisoire tiré par le serveur : l'action est au journal. */
  provisoireDonne?: () => void;
}

export function LigneMembre({ membre, soi, retire, relire, provisoireDonne }: Props) {
  const [confirmation, setConfirmation] = useState<ActionMembre>();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [provisoire, setProvisoire] = useState<string>();
  const [moi, setMoi] = useState('');
  const [erreurMoi, setErreurMoi] = useState<string>();
  const ids = { question: useId(), mdp: useId(), moi: useId(), erreurMoi: useId() };
  const champMoi = useRef<HTMLInputElement>(null);
  const declencheurs = { retrait: useRef<HTMLButtonElement>(null), provisoire: useRef<HTMLButtonElement>(null) };
  const affichage = useRef<HTMLParagraphElement>(null);
  const valeur = useRef<HTMLElement>(null);
  /** Bouton à refocaliser une fois revenu au repos (annulation, « Terminé »). */
  const retour = useRef<ActionMembre>(undefined);

  // Focus déplacé après le rendu : à l'ouverture, sur le mot de passe à saisir (la question le décrit) ; sur le
  // provisoire une fois tiré ; puis sur le bouton de départ au retour au repos.
  useEffect(() => {
    if (confirmation) champMoi.current?.focus();
  }, [confirmation]);
  useEffect(() => {
    if (provisoire) affichage.current?.focus();
  }, [provisoire]);
  useEffect(() => {
    if (confirmation || provisoire || !retour.current) return;
    declencheurs[retour.current].current?.focus();
    retour.current = undefined;
  });

  const ouvrir = (action: ActionMembre) => {
    setErreur(undefined);
    setErreurMoi(undefined);
    setMoi('');
    setConfirmation(action);
  };

  const fermer = () => {
    retour.current = confirmation;
    setConfirmation(undefined);
    setErreur(undefined);
    setErreurMoi(undefined);
    setMoi('');
  };

  const echap = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || envoi) return;
    // Consommé ici : ni le volet ni les raccourcis globaux ne réagissent au même Échap.
    e.preventDefault();
    e.stopPropagation();
    if (provisoire) terminer();
    else fermer();
  };

  const confirmer = async (e: FormEvent) => {
    e.preventDefault();
    if (!confirmation) return;
    setErreur(undefined);
    setErreurMoi(undefined);
    if (!moi) {
      setErreurMoi('Saisissez votre mot de passe pour confirmer.');
      champMoi.current?.focus();
      return;
    }
    setEnvoi(true);
    const corps = { motDePasse: moi };
    try {
      if (confirmation === 'retrait') {
        await appel('DELETE', `/api/organisation/membres/${encodeURIComponent(membre.id)}`, corps);
        retire(membre);
        return;
      }
      const r = await appel<{ motDePasse: string }>('POST', `/api/organisation/membres/${encodeURIComponent(membre.id)}/mot-de-passe`, corps);
      setMoi('');
      setConfirmation(undefined);
      setProvisoire(r.motDePasse);
      provisoireDonne?.();
    } catch (err) {
      const r = refus(err, confirmation);
      if (r.motDePasse) {
        // Mot de passe refusé : vidé, à ressaisir, le message sous le champ.
        setErreurMoi(r.motDePasse);
        setMoi('');
        champMoi.current?.focus();
      } else setErreur(r.texte);
      if (r.sessionPerdue) void useSession.getState().verifier(true);
      if (r.relire) relire(r.texte);
    } finally {
      setEnvoi(false);
    }
  };

  const terminer = () => {
    retour.current = 'provisoire';
    setProvisoire(undefined);
  };

  const texteQuestion =
    confirmation === 'retrait'
      ? `Retirer ${membre.nom} de l’organisation ? Ce compte ne pourra plus se connecter et ses sessions ouvertes se ferment tout de suite. Les acquittements et interventions déjà signés gardent son nom.`
      : `Donner un nouveau mot de passe provisoire à ${membre.nom} ? Le mot de passe actuel cesse de marcher et ses sessions ouvertes se ferment.`;

  return (
    <li className="cpt-membre">
      <div className="cpt-membre-qui">
        <span className="cpt-membre-nom">
          <b>{membre.nom}</b>
          {soi && <span className="cpt-soi">vous</span>}
          <span className={`chip ${membre.role === 'admin' ? 'accent' : ''}`}>{ROLES[membre.role]}</span>
        </span>
        <span className="cpt-membre-adresse">{membre.identifiant}</span>
      </div>

      {!soi && !confirmation && !provisoire && (
        <div className="cpt-membre-actions">
          <button
            ref={declencheurs.provisoire}
            type="button"
            className="btn sm ghost"
            onClick={() => ouvrir('provisoire')}
            aria-label={`Nouveau mot de passe provisoire pour ${membre.nom}`}
          >
            <KeyRound aria-hidden /> Mot de passe provisoire
          </button>
          <button ref={declencheurs.retrait} type="button" className="btn sm ghost" onClick={() => ouvrir('retrait')} aria-label={`Retirer ${membre.nom}`}>
            <UserMinus aria-hidden /> Retirer
          </button>
        </div>
      )}

      {confirmation && (
        <form className="cpt-membre-volet" aria-labelledby={ids.question} onKeyDown={echap} onSubmit={(e) => void confirmer(e)} noValidate>
          <p id={ids.question}>{texteQuestion}</p>
          <label className="field" htmlFor={ids.moi}>
            <span>Votre mot de passe, pour confirmer</span>
            <input
              id={ids.moi}
              ref={champMoi}
              className="input"
              type="password"
              autoComplete="current-password"
              maxLength={256}
              value={moi}
              onChange={(e) => setMoi(e.target.value)}
              aria-invalid={erreurMoi ? true : undefined}
              aria-describedby={erreurMoi ? `${ids.erreurMoi} ${ids.question}` : ids.question}
            />
            {erreurMoi && (
              <small id={ids.erreurMoi} className="cpt-champ-erreur">
                {erreurMoi}
              </small>
            )}
          </label>
          {erreur && (
            <p className="cpt-erreur" role="alert">
              {erreur}
            </p>
          )}
          <div className="cpt-actions">
            <button type="submit" className={`btn sm ${confirmation === 'retrait' ? 'danger' : ''}`} disabled={envoi} aria-busy={envoi || undefined}>
              {confirmation === 'retrait' ? <UserMinus aria-hidden /> : <KeyRound aria-hidden />}{' '}
              {confirmation === 'retrait' ? (envoi ? 'Retrait…' : 'Retirer le compte') : envoi ? 'Création…' : 'Créer le mot de passe'}
            </button>
            <button type="button" className="btn sm ghost" onClick={fermer} disabled={envoi}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {provisoire && (
        <div className="cpt-membre-volet" role="group" aria-labelledby={ids.mdp} onKeyDown={echap}>
          <p id={ids.mdp} ref={affichage} tabIndex={-1}>
            Mot de passe provisoire de {membre.nom}, affiché cette fois seulement :
          </p>
          <div className="cpt-provisoire">
            <code ref={valeur} className="cpt-provisoire-valeur">
              {provisoire}
            </code>
            <Copier texte={provisoire} quoi="le mot de passe provisoire" source={valeur} />
          </div>
          <p className="cpt-note">
            Transmettez-le de vive voix, jamais par e-mail. {membre.nom} le remplace ensuite par le sien depuis cette page, avec « Changer mon mot de passe ».
          </p>
          <div className="cpt-actions">
            <button type="button" className="btn sm" onClick={terminer}>
              Terminé, le masquer
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
