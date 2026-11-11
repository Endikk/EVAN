/**
 * Le volet d'une ligne de « À faire » : ce qu'il faut faire et quand, l'intervention planifiée s'il y en a une (avec
 * de quoi la déplacer ou l'annuler), la mesure qui dérive et avance la date, comment la tâche revient, ce qui peut
 * lâcher sur l'organe concerné (pannes connues du kit), les pannes réellement survenues sur cet organe et les passages
 * déjà faits. Tout vient du plan de maintenance, du kit machines et du journal : rien n'est rédigé à la main.
 *
 * Fenêtre modale : le focus y entre et y reste (Tab boucle), Échap ferme, et le focus revient à la ligne, ou à celle
 * qui a pris sa place quand elle a quitté la liste.
 */
import { useId, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, ClipboardCheck, History as HistoryIcon, Wrench, X } from 'lucide-react';
import type { Intervention } from '@/analytics/maintenance';
import { machineModel } from '@/domain/catalog';
import type { Alarme, Machine } from '@/domain/types';
import { Term, TonGlyph } from '@/ui/explain';
import { fmtDuration, fmtValue } from '@/ui/format';
import { usePiegeFocus } from '@/ui/usePiegeFocus';
import { openReplay } from '@/widgets/shell/navigation';
import { useRetourFocus } from '@/widgets/intervention/retourFocus';
import {
  fmtArret,
  fmtDateLongue,
  fmtJourHeure,
  joursJusqua,
  minuscule,
  quand,
  rythme,
  texteCompteur,
  tonEcheance,
  type LigneAFaire,
} from '../lib/carnet';
import { BarreTache } from './TacheLigne';
import { annulerPrevue, consignerLigne, consignerPrevueFaite, planifierLigne } from './actions';

interface Props {
  l: LigneAFaire;
  machine: Machine;
  journal: Intervention[];
  alarmes: Alarme[];
  /** Début de l'historique : « depuis le 7 octobre ». */
  depuis: number;
  now: number;
  fermer(): void;
}

/** La phrase d'état, en tête du volet : « En retard : prévu le 2 octobre, il y a 11 jours ». Affichée comme un titre, sans point final. */
function phraseEtat(l: LigneAFaire, now: number): string {
  if (l.prevue) return `Prévue ${fmtJourHeure(l.prevue.date).replace(/^./, (c) => c.toLowerCase())}`;
  const e = l.e;
  const d = l.derive;
  if (d && (!e || e.statut !== 'en_retard') && (!e?.echeance || d.franchissement < e.echeance)) {
    return `À faire avant le ${fmtDateLongue(d.franchissement)} : la mesure atteint alors son seuil`;
  }
  if (!e) return 'Pas encore de date';
  if (e.echeance === undefined) return e.statut === 'en_retard' ? 'En retard : la limite d’usure est atteinte' : 'Pas encore de date : la mesure ne bouge pas assez pour la prévoir';
  const date = fmtDateLongue(e.echeance);
  const j = joursJusqua(e.echeance, now);
  if (l.urgence === 'retard') return j === 0 ? `En retard : prévu aujourd’hui (${date})` : `En retard : prévu le ${date}, il y a ${-j} jour${-j > 1 ? 's' : ''}`;
  return `À faire ${quand(e, now)}, vers le ${date}`;
}

export function TacheVolet({ l, machine, journal, alarmes, depuis, now, fermer }: Props) {
  const titreId = useId();
  const ref = useRef<HTMLElement>(null);
  const e = l.e;
  const model = machineModel(machine);
  const organe = model.organes.find((o) => o.id === l.organeId);
  const point = e?.pointId ? model.points.find((p) => p.id === e.pointId) : undefined;
  const ton = l.urgence ? tonEcheance(l.urgence) : 'ok';

  // Le focus revient à la ligne ; si elle a quitté la liste (consignée, planifiée à un autre rang), à sa voisine.
  useRetourFocus();
  usePiegeFocus(ref, true, fermer);

  const passages = useMemo(() => (e ? journal.filter((i) => i.machineId === e.machineId && i.tacheId === e.tacheId) : []), [journal, e]);
  const pannes = useMemo(() => journal.filter((i) => i.type === 'curative' && i.machineId === l.machineId && i.organeId === l.organeId), [journal, l]);

  const consigner = () => {
    fermer();
    if (l.prevue) consignerPrevueFaite(l.prevue, machine);
    else consignerLigne(l);
  };
  const planifier = () => {
    fermer();
    planifierLigne(l);
  };
  const annuler = () => {
    if (!l.prevue) return;
    fermer();
    annulerPrevue(l.prevue, machine);
  };

  const sur = l.prevue && !e ? 'Intervention prévue' : e ? 'Entretien du plan' : 'Mesure en dérive';

  return createPortal(
    <div className="guide-fond" onMouseDown={fermer}>
      <aside ref={ref} className="guide-volet mt-volet" role="dialog" aria-modal="true" aria-labelledby={titreId} onMouseDown={(ev) => ev.stopPropagation()}>
        <header className="guide-tete">
          <span className="guide-icone" aria-hidden>
            <Wrench />
          </span>
          <div className="grow">
            <p className="guide-sur">
              {sur} · {machine.numero} {machine.nom}
            </p>
            <h2 id={titreId}>{l.tache}</h2>
          </div>
          <button type="button" className="btn sm icon ghost" onClick={fermer} aria-label="Fermer le détail de l’entretien" title="Fermer (Échap)" data-autofocus>
            <X />
          </button>
        </header>

        <div className="guide-corps mt-volet-corps">
          <p className={`mt-volet-etat ton-${ton}`}>
            <TonGlyph ton={ton} />
            <span>{phraseEtat(l, now)}</span>
          </p>
          {e && (
            <div className="mt-volet-barre">
              <BarreTache e={e} urgence={l.urgence} grande />
              <div className="mt-volet-legende">
                <span className="num">{texteCompteur(e)}</span>
                <span>le trait marque l’échéance</span>
              </div>
            </div>
          )}

          {l.prevue && (
            <section className="mt-volet-bloc">
              <h3>Intervention prévue</h3>
              <p>
                {fmtJourHeure(l.prevue.date)}, {fmtArret(l.prevue.duree)} machine arrêtée{l.prevue.auteur ? `, par ${l.prevue.auteur}` : ''}.
                {e ? ' La consigner remettra le compteur de la tâche à zéro.' : ''}
              </p>
              <p className="mt-volet-note">Elle n’entre au journal qu’une fois consignée.</p>
              <div className="mt-volet-actions">
                <button type="button" className="btn sm" onClick={planifier}>
                  <CalendarClock aria-hidden /> Déplacer
                </button>
                <button type="button" className="btn sm ghost" onClick={annuler}>
                  Annuler l’intervention
                </button>
              </div>
            </section>
          )}

          {l.derive && (
            <section className="mt-volet-bloc">
              <h3>Une mesure dérive sur cet organe</h3>
              <p>
                {l.derive.libelle} {l.derive.pente < 0 ? 'perd' : 'prend'} {fmtValue(Math.abs(l.derive.pente), l.derive.unite)} par jour : de{' '}
                {fmtValue(l.derive.valeur, l.derive.unite)} aujourd’hui, elle atteindra son {l.derive.niveau === 'alarme' ? 'seuil d’alarme' : 'seuil d’attention'} (
                {fmtValue(l.derive.seuil, l.derive.unite)}) vers le {fmtDateLongue(l.derive.franchissement)}.
              </p>
              {e && <p className="mt-volet-note">Cet entretien est à faire avant, même si son compteur ne l’exige pas encore.</p>}
            </section>
          )}

          {e && (
            <section className="mt-volet-bloc">
              <h3>Comment revient cet entretien</h3>
              {e.nature === 'conditionnelle' ? (
                <p>
                  Il se déclenche sur une mesure d’usure{point ? <>, « {minuscule(point.libelle)} »</> : null}. À faire {rythme(e)}. Elle vaut aujourd’hui{' '}
                  {fmtValue(e.compteur, e.unite)}.{e.dernierPassage !== undefined && <> Dernier changement consigné : le {fmtDateLongue(e.dernierPassage)}.</>}
                </p>
              ) : (
                <p>
                  Il revient {rythme(e)}.{e.dernierPassage !== undefined && <> Dernier passage connu : le {fmtDateLongue(e.dernierPassage)}.</>}
                </p>
              )}
              <p className="mt-volet-note">Durée prévue : {fmtArret(e.duree)}, machine arrêtée.</p>
            </section>
          )}

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

          {e && (
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
          )}
        </div>

        <footer className="mt-volet-pied">
          <button type="button" className="btn" onClick={fermer}>
            Fermer
          </button>
          {!l.prevue && (
            <button type="button" className="btn" onClick={planifier}>
              <CalendarClock aria-hidden /> Planifier
            </button>
          )}
          <button type="button" className="btn primary" onClick={consigner}>
            <ClipboardCheck /> {l.prevue ? 'Consigner : c’est fait' : 'Consigner cet entretien'}
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
