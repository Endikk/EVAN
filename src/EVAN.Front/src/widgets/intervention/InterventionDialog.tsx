/**
 * Consigner une intervention (bon de travail clos) : réparation après panne, entretien (une tâche du plan réalisée
 * repart de zéro) ou simple observation. Préremplie depuis l'écran d'origine : tâche à planifier, panne résolue,
 * machine.
 *
 * Le formulaire se lit en quatre étapes visibles (quoi, où, ce qui a été fait, quand et qui). Une aide reste sous un
 * champ seulement si elle sert à le remplir juste (un exemple, une conséquence) : un libellé clair suffit aux autres.
 * Une erreur dit quel champ pose problème et pourquoi, l'envoi se voit et la confirmation redit ce qui a été
 * enregistré. Pendant la visite guidée, le bon se ferme dès l'envoi, comme avant.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { AlertTriangle, ClipboardCheck, LoaderCircle, X } from 'lucide-react';
import { useUi, type PreSaisie } from '@/store/ui';
import { useProject } from '@/store/project';
import { useCarnet } from '@/store/carnet';
import { useLive } from '@/store/live';
import { machineModel, MACHINE_TYPES } from '@/domain/catalog';
import type { Saisie, TypeIntervention } from '@/analytics/maintenance';
import { getSource } from '@/realtime/source';
import { InfoTip } from '@/ui/InfoTip';
import { fmtDuration, fmtNombre } from '@/ui/format';
import { Select } from '@/ui/Select';
import './intervention.css';

export function InterventionDialog() {
  const saisie = useUi((s) => s.saisie);
  if (!saisie) return null;
  return <InterventionForm initial={saisie} />;
}

/** L'aide de chaque type reste visible : c'est elle qui fait choisir le bon. */
const TYPES: { id: TypeIntervention; titre: string; terme?: 'curatif' | 'preventif'; aide: string }[] = [
  { id: 'curative', titre: 'Réparation', terme: 'curatif', aide: 'Après une panne.' },
  { id: 'preventive', titre: 'Entretien', terme: 'preventif', aide: 'Prévu au plan, ou pour éviter une panne.' },
  { id: 'observation', titre: 'Observation', aide: 'Un constat sans intervention : bruit, fuite.' },
];

const DUREE_MAX_MIN = 24 * 60;
const TITRE_MIN = 3;
/** Petite tolérance sur l'heure saisie, pour une horloge de poste un peu en avance. */
const AVANCE_TOLEREE_MS = 5 * 60_000;
/** Le temps de voir que l'envoi part, sans faire attendre. */
const ENVOI_MS = 350;

const quandFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Valeur d'un champ datetime-local à l'heure locale. */
function versChamp(t: number) {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

type Champ = 'machine' | 'titre' | 'duree' | 'date';
type Erreurs = Partial<Record<Champ, string>>;

const NOM_CHAMP: Record<Champ, string> = { machine: 'machine', titre: 'ce qui a été fait', duree: 'durée', date: 'date' };

interface Valeurs {
  machineId: string;
  titre: string;
  duree: string;
  date: string;
}

/** Contrôle du bon avant enregistrement : chaque message dit quoi corriger. */
function verifier(v: Valeurs, machineExiste: boolean, now: number): Erreurs {
  const e: Erreurs = {};
  if (!v.machineId || !machineExiste) e.machine = 'Choisissez la machine sur laquelle vous êtes intervenu.';
  const titre = v.titre.trim();
  if (!titre) e.titre = 'Écrivez en quelques mots ce qui a été fait.';
  else if (titre.length < TITRE_MIN) e.titre = `L’intitulé est trop court : au moins ${TITRE_MIN} caractères.`;
  const brut = v.duree.trim();
  const d = Number(brut);
  if (!brut || !/^\d+$/.test(brut)) e.duree = 'En minutes et en chiffres, par exemple 45.';
  else if (d > DUREE_MAX_MIN) e.duree = `Une intervention dure au plus 24 h (${fmtNombre(DUREE_MAX_MIN)} min). Au-delà, consignez-en une par jour.`;
  const t = new Date(v.date).getTime();
  if (!v.date || Number.isNaN(t)) e.date = 'Indiquez la date et l’heure de l’intervention.';
  else if (t > now + AVANCE_TOLEREE_MS) e.date = 'Cette date est dans le futur : on consigne ce qui a déjà été fait.';
  return e;
}

function Coche({ faite }: { faite: boolean }) {
  return (
    <svg className={`coche ${faite ? 'faite' : ''}`} viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <circle className="coche-rond" cx="10" cy="10" r="8.5" />
      <path className="coche-trait" d="M6 10.4 8.7 13 14 7.4" />
    </svg>
  );
}

/** Une étape du bon : son numéro devient une coche quand elle est remplie. */
function Etape({ n, titre, faite, children }: { n: number; titre: string; faite: boolean; children: ReactNode }) {
  return (
    <fieldset className={`iv-etape ${faite ? 'faite' : ''}`}>
      <legend>
        <span className="iv-num" aria-hidden>
          <span className="iv-num-chiffre">{n}</span>
          <Coche faite={faite} />
        </span>
        <span>{titre}</span>
        <span className="sr-only">{faite ? ' (rempli)' : ''}</span>
      </legend>
      <div className="iv-etape-corps">{children}</div>
    </fieldset>
  );
}

/** Un champ avec son aide sous lui et, au besoin, son erreur. */
function Champ({ id, label, aide, erreur, facultatif, className = '', children }: { id: string; label: string; aide?: ReactNode; erreur?: string; facultatif?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`field iv-champ ${erreur ? 'en-erreur' : ''} ${className}`}>
      <label htmlFor={id}>
        {label}
        {facultatif && <em> (facultatif)</em>}
      </label>
      {children}
      {erreur ? (
        <p className="iv-erreur" id={`${id}-erreur`}>
          <AlertTriangle aria-hidden /> {erreur}
        </p>
      ) : (
        aide && (
          <p className="iv-aide" id={`${id}-aide`}>
            {aide}
          </p>
        )
      )}
    </div>
  );
}

const decrit = (id: string, erreur?: string, aide = true) => (erreur ? `${id}-erreur` : aide ? `${id}-aide` : undefined);

function InterventionForm({ initial }: { initial: PreSaisie }) {
  const machines = useProject((s) => s.machines);
  const perso = useProject((s) => s.perso);
  const [machineId, setMachineId] = useState(initial.machineId ?? machines[0]?.id ?? '');
  const [type, setType] = useState<TypeIntervention>(initial.type ?? 'curative');
  const [tacheId, setTacheId] = useState(initial.tacheId ?? '');
  const [organeId, setOrganeId] = useState(initial.organeId ?? '');
  const [titre, setTitre] = useState(initial.titre ?? '');
  const [compteRendu, setCompteRendu] = useState(initial.compteRendu ?? '');
  const [duree, setDuree] = useState(String(initial.duree ?? 30));
  const [auteur, setAuteur] = useState(initial.auteur ?? 'Maintenance');
  const [date, setDate] = useState(() => versChamp(initial.date ?? Date.now()));
  const [tente, setTente] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<Saisie | null>(null);
  const premier = useRef<HTMLInputElement>(null);
  const fermerRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const close = () => useUi.getState().setSaisie(null);

  const machine = machines.find((m) => m.id === machineId);
  const model = useMemo(() => (machine ? machineModel(machine, perso[machine.id]) : null), [machine, perso]);
  const plan = machine ? (MACHINE_TYPES[machine.type]?.maintenance ?? []) : [];
  const valeurs: Valeurs = { machineId, titre, duree, date };

  // Focus sur la première étape à l'ouverture, retour à l'élément d'origine à la fermeture.
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    premier.current?.focus();
    // Une liste de choix ouverte traite Échap elle-même (et le marque) : elle se ferme, le bon reste ouvert.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && close();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(timer.current);
      avant?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (fait) fermerRef.current?.focus();
  }, [fait]);

  // Les erreurs ne s'affichent qu'après un premier envoi, puis suivent les corrections à mesure qu'on tape.
  const erreurs: Erreurs = tente ? verifier(valeurs, !!machine, Date.now()) : {};

  const choisirTache = (id: string) => {
    setTacheId(id);
    const t = plan.find((x) => x.id === id);
    if (!t || !machine) return;
    setTitre(t.tache);
    setOrganeId(`${machine.id}.o${t.organe}`);
    setDuree(String(t.duree));
  };

  const enregistrer = (): Saisie | null => {
    if (!machine) return null;
    const s = useCarnet.getState().ajouter({
      machineId: machine.id,
      organeId: organeId || undefined,
      type,
      // Une heure saisie un peu en avance (horloge du poste) est ramenée à maintenant : le carnet ne connaît pas le futur.
      date: Math.min(new Date(date).getTime() || Date.now(), Date.now()),
      duree: Math.max(0, Number(duree) || 0),
      titre: titre.trim(),
      compteRendu: compteRendu.trim() || undefined,
      auteur: auteur.trim() || 'Maintenance',
      tacheId: type === 'preventive' && tacheId ? tacheId : undefined,
    });
    getSource()?.logIntervention(s, `${machine.numero} ${machine.nom}`);
    return s;
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (envoi) return;
    const errs = verifier(valeurs, !!machine, Date.now());
    setTente(true);
    const fautif = (Object.keys(errs) as Champ[])[0];
    if (fautif) {
      document.getElementById(`iv-${fautif}`)?.focus();
      return;
    }
    // Visite guidée : le bon se ferme aussitôt, la notification suffit.
    if (useUi.getState().tour.playing) {
      const s = enregistrer();
      if (s && machine) useLive.getState().pushToast({ gravite: 'succes', titre: 'Intervention consignée', texte: `${machine.numero} · ${s.titre}${s.tacheId ? ' · compteur remis à zéro' : ''}` });
      close();
      return;
    }
    setEnvoi(true);
    timer.current = window.setTimeout(() => {
      setFait(enregistrer());
      setEnvoi(false);
    }, ENVOI_MS);
  };

  const recommencer = () => {
    setFait(null);
    setTente(false);
    setTacheId('');
    setTitre('');
    setCompteRendu('');
    setDate(versChamp(Date.now()));
    window.setTimeout(() => premier.current?.focus(), 0);
  };

  const nbErreurs = Object.keys(erreurs).length;
  const etape3 = titre.trim().length >= TITRE_MIN;
  const quand = verifier(valeurs, true, Date.now());
  const etape4 = !quand.duree && !quand.date;

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="modal wide iv"
        role="dialog"
        aria-modal="true"
        aria-labelledby="iv-title"
        aria-busy={envoi}
        data-tour="saisie"
        noValidate
        onSubmit={submit}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="btn sm icon ghost modal-close" onClick={close} aria-label="Fermer" title="Fermer (Échap)">
          <X />
        </button>
        {fait && machine ? (
          <Confirmation s={fait} machineLabel={`${machine.numero} ${machine.nom}`} organe={model?.organes.find((o) => o.id === fait.organeId)?.nom} plan={plan} fermer={close} recommencer={recommencer} fermerRef={fermerRef} />
        ) : (
          <>
            <span className="modal-icon accent">
              <ClipboardCheck />
            </span>
            <h2 id="iv-title" className="iv-titre">
              Consigner une intervention
              <InfoTip label="Comprendre : consigner une intervention">
                <p>Le bon rejoint le carnet de la machine et le journal des interventions. Une tâche du plan consignée repart de zéro.</p>
              </InfoTip>
            </h2>

            <Etape n={1} titre="Quel type d’intervention ?" faite>
              <div className="iv-types" role="radiogroup" aria-label="Type d’intervention">
                {TYPES.map((t) => (
                  <label key={t.id} className={`iv-type ${type === t.id ? 'choisi' : ''}`}>
                    <input ref={type === t.id ? premier : undefined} type="radio" name="iv-type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} />
                    <span className="iv-type-titre">{t.titre}</span>
                    <span className="iv-type-aide">{t.aide}</span>
                  </label>
                ))}
              </div>
            </Etape>

            <Etape n={2} titre="Sur quelle machine ?" faite={!!machine}>
              <div className="form-grid">
                <Champ id="iv-machine" label="Machine" erreur={erreurs.machine}>
                  <Select
                    id="iv-machine"
                    value={machineId}
                    aria-invalid={!!erreurs.machine}
                    aria-describedby={decrit('iv-machine', erreurs.machine, false)}
                    onChange={(v) => (setMachineId(v), setTacheId(''), setOrganeId(''))}
                    options={machines.map((m) => ({ value: m.id, label: `${m.numero} · ${m.nom}` }))}
                  />
                </Champ>
                <Champ id="iv-organe" label="Organe" aide="La partie de la machine. « Machine entière » si vous hésitez.">
                  <Select
                    id="iv-organe"
                    value={organeId}
                    aria-describedby="iv-organe-aide"
                    onChange={setOrganeId}
                    options={[{ value: '', label: 'Machine entière' }, ...(model?.organes ?? []).map((o) => ({ value: o.id, label: `${o.numero}. ${o.nom}` }))]}
                  />
                </Champ>
                {type === 'preventive' && plan.length > 0 && (
                  <Champ id="iv-tache" label="Tâche du plan réalisée" className="span-2" aide="Remet son compteur à zéro. « Hors plan » si elle n’est pas au plan.">
                    <Select
                      id="iv-tache"
                      value={tacheId}
                      aria-describedby="iv-tache-aide"
                      onChange={choisirTache}
                      options={[{ value: '', label: 'Hors plan' }, ...plan.map((t) => ({ value: t.id, label: t.tache }))]}
                    />
                  </Champ>
                )}
              </div>
            </Etape>

            <Etape n={3} titre="Qu’avez-vous fait ?" faite={etape3}>
              <div className="form-grid">
                <Champ id="iv-titre" label="En une phrase" className="span-2" erreur={erreurs.titre} aide="Par exemple : roulement du cylindre G2 remplacé.">
                  <input
                    id="iv-titre"
                    className="input"
                    value={titre}
                    maxLength={120}
                    autoComplete="off"
                    aria-invalid={!!erreurs.titre}
                    aria-describedby={decrit('iv-titre', erreurs.titre)}
                    onChange={(e) => setTitre(e.target.value)}
                  />
                </Champ>
                <Champ id="iv-cr" label="Compte rendu" facultatif className="span-2" aide="Ce que vous avez constaté, les pièces changées.">
                  <textarea id="iv-cr" className="input textarea" rows={3} value={compteRendu} maxLength={1000} aria-describedby="iv-cr-aide" onChange={(e) => setCompteRendu(e.target.value)} />
                </Champ>
              </div>
            </Etape>

            <Etape n={4} titre="Quand, combien de temps, qui ?" faite={etape4}>
              <div className="form-grid iv-grille-3">
                <Champ id="iv-date" label="Début" erreur={erreurs.date}>
                  <input
                    id="iv-date"
                    className="input"
                    type="datetime-local"
                    value={date}
                    max={versChamp(Date.now())}
                    aria-invalid={!!erreurs.date}
                    aria-describedby={decrit('iv-date', erreurs.date, false)}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </Champ>
                <Champ id="iv-duree" label="Durée" erreur={erreurs.duree}>
                  <span className="input-unit">
                    <input
                      id="iv-duree"
                      className="input num"
                      inputMode="numeric"
                      value={duree}
                      aria-invalid={!!erreurs.duree}
                      aria-describedby={decrit('iv-duree', erreurs.duree, false)}
                      onChange={(e) => setDuree(e.target.value)}
                    />
                    <i>min</i>
                  </span>
                </Champ>
                <Champ id="iv-auteur" label="Intervenant">
                  <input id="iv-auteur" className="input" value={auteur} maxLength={60} autoComplete="name" onChange={(e) => setAuteur(e.target.value)} />
                </Champ>
              </div>
            </Etape>

            {nbErreurs > 0 && (
              <div className="iv-resume" role="alert">
                <AlertTriangle aria-hidden />
                <span>
                  {nbErreurs > 1 ? `${nbErreurs} champs à corriger : ` : 'Un champ à corriger : '}
                  {(Object.keys(erreurs) as Champ[]).map((c, i) => (
                    <span key={c}>
                      {i > 0 && ', '}
                      <button type="button" className="iv-lien" onClick={() => document.getElementById(`iv-${c}`)?.focus()}>
                        {NOM_CHAMP[c]}
                      </button>
                    </span>
                  ))}
                  .
                </span>
              </div>
            )}

            <div className="iv-pied">
              <button type="button" className="btn" onClick={close}>
                Annuler
              </button>
              <button type="submit" className="btn primary" disabled={envoi}>
                {envoi ? <LoaderCircle className="iv-tourne" aria-hidden /> : <ClipboardCheck />}
                {envoi ? 'Enregistrement…' : 'Consigner'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

interface ConfirmationProps {
  s: Saisie;
  machineLabel: string;
  organe?: string;
  plan: { id: string; tache: string; nature: 'systematique' | 'conditionnelle'; intervalle?: number; unite?: 'h' | 'j' }[];
  fermer(): void;
  recommencer(): void;
  fermerRef: RefObject<HTMLButtonElement | null>;
}

/** Ce qui a été enregistré, redit en clair, et ce que ça change pour la tâche du plan. */
function Confirmation({ s, machineLabel, organe, plan, fermer, recommencer, fermerRef }: ConfirmationProps) {
  const type = TYPES.find((t) => t.id === s.type)!;
  const tache = s.tacheId ? plan.find((t) => t.id === s.tacheId) : undefined;
  const rythme = tache?.intervalle ? (tache.unite === 'j' ? `dans ${fmtNombre(tache.intervalle)} jours` : `dans ${fmtNombre(tache.intervalle)} h de marche`) : undefined;
  return (
    <div className="iv-ok" role="status">
      <span className="iv-ok-icone" aria-hidden>
        <Coche faite />
      </span>
      <h2 id="iv-title">Intervention consignée</h2>
      <p className="muted">Dans le carnet de {machineLabel} et le journal des interventions.</p>
      <dl className="iv-recap">
        <div>
          <dt>Type</dt>
          <dd>
            {type.titre}
            {type.terme ? ` (${type.terme === 'curatif' ? 'curatif' : 'préventif'})` : ''}
          </dd>
        </div>
        <div>
          <dt>Ce qui a été fait</dt>
          <dd>{s.titre}</dd>
        </div>
        <div>
          <dt>Où</dt>
          <dd>{organe ? `${machineLabel}, ${organe}` : `${machineLabel}, machine entière`}</dd>
        </div>
        <div>
          <dt>Quand</dt>
          <dd>
            {quandFmt.format(s.date)}, pendant {fmtDuration(s.duree * 60_000)}
          </dd>
        </div>
        <div>
          <dt>Par</dt>
          <dd>{s.auteur}</dd>
        </div>
        {s.compteRendu && (
          <div>
            <dt>Compte rendu</dt>
            <dd>{s.compteRendu}</dd>
          </div>
        )}
      </dl>
      {tache && (
        <p className="iv-ok-note">
          {tache.nature === 'systematique'
            ? `La tâche « ${tache.tache} » repart de zéro${rythme ? ` : prochain passage ${rythme}` : ''}.`
            : `La tâche « ${tache.tache} » suit une mesure d’usure : sa prochaine date dépend de la mesure.`}
        </p>
      )}
      <div className="iv-pied">
        <button type="button" className="btn" onClick={recommencer}>
          Consigner une autre intervention
        </button>
        <button ref={fermerRef} type="button" className="btn primary" onClick={fermer}>
          Fermer
        </button>
      </div>
    </div>
  );
}
