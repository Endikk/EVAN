/**
 * Nom de l'organisation : demandé avant de commencer dans l'assistant (une organisation sans nom ne démarre pas),
 * puis modifiable depuis le sélecteur d'usine. Un aperçu montre où ce nom s'affichera ; un nom vide est refusé avec
 * une phrase qui dit pourquoi, plutôt qu'un bouton grisé muet.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Building2, X } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import './usines.css';

const LONGUEUR_MAX = 80;

export function OrganisationDialog() {
  const mode = useProject((s) => s.mode);
  const nom = useProject((s) => s.organisation.nom);
  const edit = useUi((s) => s.organisationEdit);
  const onboarding = mode === 'assistant' && !nom;
  if (!onboarding && !edit) return null;
  return <OrganisationForm onboarding={onboarding} initial={nom} />;
}

/** Après un renommage, le focus revient au sélecteur d'usine d'où la fenêtre a été ouverte. */
function rendreFocus() {
  window.setTimeout(() => document.querySelector<HTMLButtonElement>('.usine-switch')?.focus(), 0);
}

function OrganisationForm({ onboarding, initial }: { onboarding: boolean; initial: string }) {
  const [value, setValue] = useState(initial);
  const [essai, setEssai] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const ids = { titre: useId(), aide: useId(), erreur: useId() };
  const vide = !value.trim();
  const erreur = essai && vide;
  const close = () => {
    useUi.getState().setOrganisationEdit(false);
    rendreFocus();
  };

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    if (onboarding) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onboarding]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (vide) {
      setEssai(true);
      input.current?.focus();
      return;
    }
    useProject.getState().setOrganisationNom(value);
    useUi.getState().setOrganisationEdit(false);
    // Étape suivante : localiser la première usine. Sinon, retour au sélecteur.
    if (onboarding) window.setTimeout(() => document.querySelector<HTMLInputElement>('.searchbox input')?.focus(), 50);
    else rendreFocus();
  };

  return (
    <div className="modal-backdrop org-dialog-fond" onMouseDown={onboarding ? undefined : close}>
      <form
        className="modal org-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.titre}
        noValidate
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {!onboarding && (
          <button type="button" className="btn sm icon ghost modal-close" onClick={close} aria-label="Fermer sans renommer" title="Fermer (Échap)">
            <X />
          </button>
        )}
        <span className="modal-icon accent" aria-hidden>
          <Building2 />
        </span>
        <h2 id={ids.titre}>{onboarding ? 'Votre organisation' : 'Renommer l’organisation'}</h2>
        <p className="muted">
          {onboarding
            ? 'Le nom de votre entreprise. Il regroupe toutes vos usines : vous placerez la première sur la carte juste après, et vous pourrez en ajouter d’autres ensuite.'
            : 'Ce nom s’affiche en haut de l’écran, au-dessus de toutes vos usines.'}
        </p>
        <label className="field" style={{ marginTop: 16 }}>
          <span>Nom de l’organisation</span>
          <input
            ref={input}
            className="input"
            value={value}
            maxLength={LONGUEUR_MAX}
            placeholder="Ex. Valtiq"
            autoComplete="organization"
            aria-invalid={erreur || undefined}
            aria-describedby={erreur ? ids.erreur : ids.aide}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {erreur ? (
          <span id={ids.erreur} className="org-dialog-erreur" role="alert">
            Donnez un nom pour continuer, même provisoire : vous pourrez le changer plus tard.
          </span>
        ) : (
          <span id={ids.aide} className="org-dialog-aide">
            {onboarding ? 'Vous pourrez le changer plus tard.' : `${LONGUEUR_MAX} caractères au plus.`}
          </span>
        )}

        <div className="org-apercu" aria-hidden>
          <Building2 />
          <span className="org-apercu-txt">
            <small>Organisation</small>
            <b className={vide ? 'vide' : ''}>{vide ? 'Votre organisation' : value.trim()}</b>
          </span>
          <span className="org-apercu-legende">Aperçu en haut de l’écran</span>
        </div>

        {onboarding && (
          <ol className="modal-steps" aria-label="Les étapes pour commencer">
            <li className="on" aria-current="step">
              Nommer l’organisation
            </li>
            <li>Trouver la première usine sur la carte</li>
            <li>Ajouter les suivantes, s’il y en a</li>
          </ol>
        )}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          {onboarding ? (
            <Link to="/" className="btn">
              Retour à l’accueil
            </Link>
          ) : (
            <button type="button" className="btn" onClick={close}>
              Annuler
            </button>
          )}
          <button type="submit" className="btn primary">
            {onboarding ? 'Commencer' : 'Enregistrer'} <ArrowRight aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
