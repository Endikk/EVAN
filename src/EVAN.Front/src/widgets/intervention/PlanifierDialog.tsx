/**
 * Planifier une intervention : choisir le jour et l'heure où la faire, sa durée et qui s'en charge. Elle rejoint
 * « À faire » à sa date, rattachée à la tâche du plan sur le même organe, et n'entre au journal qu'une fois consignée.
 * La même fenêtre déplace une intervention déjà planifiée.
 *
 * La date limite (seuil de la dérive, échéance du plan) est rappelée : choisir plus tard reste possible, la fenêtre le
 * signale sans l'interdire. Une date passée est refusée : ce qui est fait se consigne.
 */
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, CalendarClock, X } from 'lucide-react';
import { useProject } from '@/store/project';
import { useCarnet } from '@/store/carnet';
import { useLive } from '@/store/live';
import { machineModel } from '@/domain/catalog';
import { usePiegeFocus } from '@/ui/usePiegeFocus';
import { ecrireDuree, lireDuree } from './duree';
import { QuestionQuitter, useGardeSaisie } from './Garde';
import { dateProposee, usePlanification, verifierPlanification, type CiblePlanification } from './planification';
import { useRetourFocus } from './retourFocus';
import './intervention.css';

const quandFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const jourFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });

/** Valeur d'un champ datetime-local à l'heure locale. */
function versChamp(t: number) {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

type Champ = 'date' | 'duree';
type Erreurs = Partial<Record<Champ, string>>;

export function PlanifierDialog() {
  const cible = usePlanification((s) => s.cible);
  if (!cible) return null;
  return <Formulaire key={`${cible.prevueId ?? ''}${cible.machineId}${cible.titre}`} c={cible} />;
}

function Formulaire({ c }: { c: CiblePlanification }) {
  const machines = useProject((s) => s.machines);
  const machine = machines.find((m) => m.id === c.machineId);
  const organe = useMemo(() => (machine && c.organeId ? machineModel(machine).organes.find((o) => o.id === c.organeId)?.nom : undefined), [machine, c.organeId]);
  const [initial] = useState(() => ({
    date: versChamp(c.date ?? dateProposee(Date.now(), c.limite?.date)),
    duree: ecrireDuree(c.duree),
    auteur: c.auteur ?? '',
  }));
  const [date, setDate] = useState(initial.date);
  const [duree, setDuree] = useState(initial.duree);
  const [auteur, setAuteur] = useState(initial.auteur);
  const [tente, setTente] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const deplacer = !!c.prevueId;

  const fermer = () => usePlanification.getState().fermer();
  const modifie = date !== initial.date || duree !== initial.duree || auteur !== initial.auteur;
  const garde = useGardeSaisie(modifie, fermer);
  // Le focus revient au bouton qui a ouvert ; s'il a disparu (le volet fermé), à la ligne ou au titre de son bloc.
  useRetourFocus();
  usePiegeFocus(ref, true, garde.echap);

  const erreurs: Erreurs = tente ? verifierPlanification({ date, duree }, Date.now()) : {};
  const t = new Date(date).getTime();
  const apresLimite = !Number.isNaN(t) && c.limite && t > c.limite.date;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = verifierPlanification({ date, duree }, Date.now());
    setTente(true);
    const fautif = (['date', 'duree'] as Champ[]).find((k) => errs[k]);
    if (fautif) {
      document.getElementById(`pl-${fautif}`)?.focus();
      return;
    }
    const carnet = useCarnet.getState();
    const minutes = lireDuree(duree) ?? c.duree;
    const avant = c.prevueId ? carnet.prevues.find((p) => p.id === c.prevueId) : undefined;
    const prevue = carnet.planifier({
      id: c.prevueId,
      machineId: c.machineId,
      organeId: c.organeId,
      tacheId: c.tacheId,
      titre: c.titre,
      date: t,
      duree: minutes,
      auteur: auteur.trim() || undefined,
      pointId: c.pointId,
    });
    fermer();
    useLive.getState().pushToast({
      gravite: 'succes',
      titre: deplacer ? 'Intervention déplacée' : 'Intervention planifiée',
      texte: `${machine?.numero ?? ''} · ${c.titre}, ${quandFmt.format(t)}`,
      action: {
        libelle: 'Annuler',
        faire: () => (avant ? useCarnet.getState().planifier(avant) : useCarnet.getState().annulerPrevue(prevue.id)),
      },
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={garde.fond}>
      <form
        ref={ref}
        className="modal wide iv pl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pl-titre"
        aria-describedby="pl-quoi"
        noValidate
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="btn sm icon ghost modal-close" onClick={fermer} aria-label="Fermer" title="Fermer (Échap)">
          <X />
        </button>
        <span className="modal-icon">
          <CalendarClock />
        </span>
        <h2 id="pl-titre" className="iv-titre">
          {deplacer ? 'Déplacer l’intervention' : 'Planifier l’intervention'}
        </h2>
        <p id="pl-quoi" className="pl-quoi">
          <b>{c.titre}</b>
          <span>
            {machine ? `${machine.numero} ${machine.nom}` : c.machineId}
            {organe ? `, ${organe}` : ''}
          </span>
          {c.tacheId && <span className="pl-note">Tâche du plan : la consigner remettra son compteur à zéro.</span>}
        </p>
        {c.limite && (
          <p className={`pl-limite ${apresLimite ? 'depassee' : ''}`}>
            {apresLimite && <AlertTriangle aria-hidden />}
            <span>
              {c.limite.raison}. {apresLimite ? `La date choisie tombe après le ${jourFmt.format(c.limite.date)}.` : 'Prévoyez avant.'}
            </span>
          </p>
        )}

        <div className="form-grid iv-grille-3 pl-champs">
          <div className={`field iv-champ ${erreurs.date ? 'en-erreur' : ''}`}>
            <label htmlFor="pl-date">Jour et heure</label>
            <input
              id="pl-date"
              className="input"
              type="datetime-local"
              value={date}
              min={versChamp(Date.now())}
              aria-invalid={!!erreurs.date}
              aria-describedby={erreurs.date ? 'pl-date-erreur' : undefined}
              data-autofocus
              onChange={(e) => setDate(e.target.value)}
            />
            {erreurs.date && (
              <p className="iv-erreur" id="pl-date-erreur">
                <AlertTriangle aria-hidden /> {erreurs.date}
              </p>
            )}
          </div>
          <div className={`field iv-champ ${erreurs.duree ? 'en-erreur' : ''}`}>
            <label htmlFor="pl-duree">Durée</label>
            <input
              id="pl-duree"
              className="input num"
              value={duree}
              autoComplete="off"
              aria-invalid={!!erreurs.duree}
              aria-describedby={erreurs.duree ? 'pl-duree-erreur' : undefined}
              onChange={(e) => setDuree(e.target.value)}
            />
            {erreurs.duree && (
              <p className="iv-erreur" id="pl-duree-erreur">
                <AlertTriangle aria-hidden /> {erreurs.duree}
              </p>
            )}
          </div>
          <div className="field iv-champ">
            <label htmlFor="pl-auteur">
              Intervenant <em>(facultatif)</em>
            </label>
            <input id="pl-auteur" className="input" value={auteur} maxLength={60} autoComplete="name" onChange={(e) => setAuteur(e.target.value)} />
          </div>
        </div>

        <div className="iv-pied">
          {garde.quitter ? (
            <QuestionQuitter rester={garde.rester} quitter={fermer} />
          ) : (
            <>
              <button type="button" className="btn" onClick={fermer}>
                Annuler
              </button>
              <button type="submit" className="btn primary">
                <CalendarClock aria-hidden /> {deplacer ? 'Déplacer' : 'Planifier'}
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
