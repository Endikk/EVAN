/**
 * Le volet d'un entretien : ce qu'il faut faire et quand, comment la tâche revient, ce qui peut lâcher sur l'organe
 * concerné (pannes connues du kit), les pannes réellement survenues sur cet organe et les passages déjà faits.
 * Tout vient du plan de maintenance, du kit machines et du journal : rien n'est rédigé à la main pour la tâche.
 */
import { useEffect, useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ClipboardCheck, History as HistoryIcon, Wrench, X } from 'lucide-react';
import type { Echeance, Intervention } from '@/analytics/maintenance';
import { machineModel } from '@/domain/catalog';
import type { Alarme, Machine } from '@/domain/types';
import { Term, TonGlyph } from '@/ui/explain';
import { fmtDuration, fmtValue } from '@/ui/format';
import { openReplay } from '@/widgets/shell/navigation';
import { fmtDateLongue, fmtJourHeure, joursJusqua, quand, rythme, texteCompteur, tonEcheance, type Urgence } from '../lib/carnet';
import { BarreTache, consignerTache } from './TacheLigne';

interface Props {
  e: Echeance;
  urgence: Urgence | null;
  machine: Machine;
  journal: Intervention[];
  alarmes: Alarme[];
  /** Début de l'historique : « depuis le 7 octobre ». */
  depuis: number;
  now: number;
  fermer(): void;
}

/** La phrase d'état, en tête du volet : « En retard : prévu le 2 octobre, il y a 11 jours. » */
function phraseEtat(e: Echeance, u: Urgence | null, now: number): string {
  if (e.echeance === undefined) return e.statut === 'en_retard' ? 'En retard : la limite d’usure est atteinte.' : 'Pas encore de date : la mesure ne bouge pas assez pour la prévoir.';
  const date = fmtDateLongue(e.echeance);
  const j = joursJusqua(e.echeance, now);
  if (u === 'retard') return j === 0 ? `En retard : prévu aujourd’hui (${date}).` : `En retard : prévu le ${date}, il y a ${-j} jour${-j > 1 ? 's' : ''}.`;
  return `À faire ${quand(e, now)}, vers le ${date}.`;
}

export function TacheVolet({ e, urgence, machine, journal, alarmes, depuis, now, fermer }: Props) {
  const titreId = useId();
  const fermerRef = useRef<HTMLButtonElement>(null);
  const model = machineModel(machine);
  const organe = model.organes.find((o) => o.id === e.organeId);
  const point = e.pointId ? model.points.find((p) => p.id === e.pointId) : undefined;
  const ton = urgence ? tonEcheance(urgence) : 'ok';

  const passages = useMemo(() => journal.filter((i) => i.machineId === e.machineId && i.tacheId === e.tacheId), [journal, e]);
  const pannes = useMemo(() => journal.filter((i) => i.type === 'curative' && i.machineId === e.machineId && i.organeId === e.organeId), [journal, e]);

  useEffect(() => {
    fermerRef.current?.focus();
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && fermer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fermer]);

  const consigner = () => {
    fermer();
    consignerTache(e);
  };

  return createPortal(
    <div className="guide-fond" onMouseDown={fermer}>
      <aside className="guide-volet mt-volet" role="dialog" aria-modal="true" aria-labelledby={titreId} onMouseDown={(ev) => ev.stopPropagation()}>
        <header className="guide-tete">
          <span className="guide-icone" aria-hidden>
            <Wrench />
          </span>
          <div className="grow">
            <p className="guide-sur">
              Entretien du plan · {machine.numero} {machine.nom}
            </p>
            <h2 id={titreId}>{e.tache}</h2>
          </div>
          <button ref={fermerRef} type="button" className="btn sm icon ghost" onClick={fermer} aria-label="Fermer le détail de l’entretien" title="Fermer (Échap)">
            <X />
          </button>
        </header>

        <div className="guide-corps mt-volet-corps">
          <p className={`mt-volet-etat ton-${ton}`}>
            <TonGlyph ton={ton} />
            <span>{phraseEtat(e, urgence, now)}</span>
          </p>
          <div className="mt-volet-barre">
            <BarreTache e={e} urgence={urgence} grande />
            <div className="mt-volet-legende">
              <span className="num">{texteCompteur(e)}</span>
              <span>le trait marque l’échéance</span>
            </div>
          </div>

          <section className="mt-volet-bloc">
            <h3>Comment revient cet entretien</h3>
            {e.nature === 'conditionnelle' ? (
              <p>
                Il se déclenche sur une mesure d’usure{point ? <>, « {point.libelle.toLowerCase()} »</> : null}. À faire {rythme(e)}. Elle vaut aujourd’hui{' '}
                {fmtValue(e.compteur, e.unite)}.
              </p>
            ) : (
              <p>
                Il revient {rythme(e)}.{e.dernierPassage !== undefined && <> Dernier passage connu : le {fmtDateLongue(e.dernierPassage)}.</>}
              </p>
            )}
            <p className="mt-volet-note">Durée prévue : {e.duree} min, machine arrêtée.</p>
          </section>

          {organe && (
            <section className="mt-volet-bloc">
              <h3>Sur quel organe</h3>
              <p>
                Il touche l’<Term k="organe">organe</Term> « {organe.nom} » de {machine.numero}.
              </p>
              {organe.pannesTypiques && organe.pannesTypiques.length > 0 && (
                <>
                  <p className="mt-volet-sous">Ce qui peut lâcher sur cet organe, d’après le kit machines :</p>
                  <ul className="mt-volet-liste">
                    {organe.pannesTypiques.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {organe.methode && (
                <p className="mt-volet-conseil">
                  <b>Pour le voir venir.</b> {organe.methode}
                </p>
              )}
            </section>
          )}

          <section className="mt-volet-bloc">
            <h3>Pannes sur cet organe depuis le {fmtDateLongue(depuis)}</h3>
            {pannes.length ? (
              <ul className="mt-volet-histo">
                {pannes.slice(0, 5).map((i) => {
                  const a = i.alarmeId ? alarmes.find((x) => x.id === i.alarmeId) : undefined;
                  return (
                    <li key={i.id}>
                      <div className="grow">
                        <b>{a?.message ?? i.titre}</b>
                        <span>
                          {fmtJourHeure(i.debut)}
                          {i.fin ? `, machine arrêtée ${fmtDuration(i.fin - i.debut)}` : ''}
                        </span>
                      </div>
                      {a && (
                        <button type="button" className="btn sm" onClick={() => (fermer(), openReplay(a))}>
                          <HistoryIcon /> Revoir
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p>Aucune panne enregistrée sur cet organe.</p>
            )}
          </section>

          <section className="mt-volet-bloc">
            <h3>Passages déjà faits</h3>
            {passages.length ? (
              <ul className="mt-volet-histo">
                {passages.map((i) => (
                  <li key={i.id}>
                    <div className="grow">
                      <b>{fmtJourHeure(i.debut)}</b>
                      <span>
                        {[i.auteur, i.fin ? fmtDuration(i.fin - i.debut) : null, i.source === 'saisie' ? 'consigné à l’écran' : null].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Aucun passage depuis le {fmtDateLongue(depuis)}.</p>
            )}
          </section>
        </div>

        <footer className="mt-volet-pied">
          <button type="button" className="btn" onClick={fermer}>
            Fermer
          </button>
          <button type="button" className="btn primary" onClick={consigner}>
            <ClipboardCheck /> Consigner cet entretien
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
