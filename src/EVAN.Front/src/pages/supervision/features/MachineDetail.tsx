/**
 * « Ce qui se passe dans cette machine » : son état (et, hors de la marche normale, une phrase courte qui dit depuis
 * quand et où), sa vitesse et ses étiquettes jetées, ses alarmes en cours, ses organes un par un avec leurs mesures en
 * direct, puis une rangée compacte : dernière alarme, dérive repérée, prochain entretien (le détail est dans les « ? »).
 * Une panne close il y a peu garde sa fiche, qui propose de consigner l'intervention et de revoir la panne.
 * Le panneau s'ouvre sur un clic dans la liste des machines ou dans le plan 3D.
 */
import { useMemo } from 'react';
import { History as HistoryIcon, LocateFixed, PlugZap, Ruler, Wrench } from 'lucide-react';
import type { Alarme, EtatMachine } from '@/domain/types';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { useLive, getSeries, type MachineLive } from '@/store/live';
import { useCarnet } from '@/store/carnet';
import { machineModel, MACHINE_TYPES } from '@/domain/catalog';
import { StatusIcon, StatusPill, LIBELLE_HORS_LIGNE, etatAffiche } from '@/ui/status';
import { Sparkline } from '@/ui/Sparkline';
import { SimulatedChip } from '@/ui/SimulatedChip';
import { ChiffresSecondaires, Repere, TitreCarte, type ChiffreSecondaire } from '@/ui/explain';
import { fmtDay, fmtDuration, fmtEcheance, fmtHM, fmtValue } from '@/ui/format';
import { debutDePoste, getHistory } from '@/sim/history';
import { echeances, previsions } from '@/analytics/maintenance';
import { AlarmCard } from '@/widgets/pannes/AlarmCard';
import { RepeatDefectTool } from '@/widgets/pannes/RepeatDefectTool';
import { estExercice } from '@/widgets/pannes/exercice';
import { focusAlarm, openPage, openReplay } from '@/widgets/shell/navigation';
import { depuisCompteurs, ETAT_MOT, minusculeInitiale, motVitesse, parUrgence, type Ton } from '../lib/atelier';

const JOUR_MS = 86_400_000;
/** Une panne close garde sa fiche dans le panneau ce temps-là : de quoi consigner l'intervention ou la revoir. */
const FICHE_CLOSE_MS = 10 * 60_000;

function quand(t: number, now: number): string {
  const jour = new Date(t).toDateString();
  if (jour === new Date(now).toDateString()) return `aujourd’hui à ${fmtHM(t)}`;
  if (jour === new Date(now - JOUR_MS).toDateString()) return `hier à ${fmtHM(t)}`;
  return `le ${fmtDay(t)} à ${fmtHM(t)}`;
}

/** Quand, en court, pour une valeur : « 14:02 » aujourd'hui, « hier 14:02 », sinon le jour. */
function quandCourt(t: number, now: number): string {
  const jour = new Date(t).toDateString();
  if (jour === new Date(now).toDateString()) return fmtHM(t);
  if (jour === new Date(now - JOUR_MS).toDateString()) return `hier ${fmtHM(t)}`;
  return fmtDay(t);
}

/**
 * L'état de la machine en une phrase courte, seulement hors de la marche normale : depuis quand et où. En marche, la
 * vitesse et son mot disent déjà tout.
 */
function phraseMachine(l: MachineLive | undefined, etat: EtatMachine, organeEnCause: string | undefined, now: number): { ton: Ton; texte: string } | undefined {
  if (!l) return { ton: 'neutre', texte: 'En attente des premières données.' };
  if (l.horsLigne) return { ton: 'warn', texte: 'Liaison coupée : l’état affiché est le dernier connu.' };
  const depuis = fmtDuration(now - l.depuis);
  const cote = organeEnCause ? `, côté ${minusculeInitiale(organeEnCause)}` : '';
  switch (etat) {
    case 'panne':
      return { ton: 'crit', texte: `En panne depuis ${depuis}${cote}.` };
    case 'attention':
      return { ton: 'warn', texte: `Un point à surveiller${cote}.` };
    case 'calage':
      return { ton: 'neutre', texte: `En réglage depuis ${depuis}.` };
    case 'arret':
      return { ton: 'neutre', texte: `À l’arrêt depuis ${depuis}.` };
    default:
      return undefined;
  }
}

/** Couleur d'une mesure : calme quand elle est dans sa plage, ambre puis cramoisi quand elle en sort. */
function couleurMesure(niveau: string | undefined): string {
  if (niveau === 'alarme') return 'var(--crit)';
  if (niveau === 'attention') return 'var(--warn)';
  return 'var(--text-3)';
}

export function MachineDetail({ id }: { id: string }) {
  const machine = useProject((s) => s.machines.find((m) => m.id === id));
  const machines = useProject((s) => s.machines);
  const perso = useProject((s) => s.perso[id]);
  const live = useLive((s) => s.machines[id]);
  const values = useLive((s) => s.values);
  const toutes = useLive((s) => s.alarms);
  const source = useLive((s) => s.source);
  const focus = useUi((s) => s.focus);
  const diagnostic = useUi((s) => s.diagnosticMachineId === id);
  const saisies = useCarnet((s) => s.saisies);
  const alarmes = useMemo(() => parUrgence(toutes.filter((a) => a.machineId === id)), [toutes, id]);

  // Prochaine échéance, dérive détectée et dernière alarme passée : ce que la maintenance doit savoir de la machine.
  const suivi = useMemo(() => {
    if (!machine) return null;
    const now = Date.now();
    const h = getHistory(machines);
    // Une alarme close au moment où une autre naît sur le même point a été escaladée, pas réglée : on l'écarte.
    const enCours = toutes.filter((a) => a.machineId === id && a.statut !== 'resolue');
    const escaladee = (a: Alarme) => enCours.some((x) => x.pointId === a.pointId && x.horodatage === a.finLe);
    const passees: (Alarme & { simulee?: boolean })[] = [
      ...toutes.filter((a) => a.machineId === id && a.statut === 'resolue' && !escaladee(a)),
      ...h.alarmes.filter((a) => a.machineId === id && a.horodatage <= now).map((a) => ({ ...a, simulee: true })),
    ];
    const derniere = passees.sort((a, b) => b.horodatage - a.horodatage)[0];
    if (machine.creeLe) return { derniere: derniere && !derniere.simulee ? derniere : undefined, now };
    const prochain = echeances(h, machine, now, saisies)
      .filter((e) => e.echeance !== undefined)
      .sort((a, b) => a.echeance! - b.echeance!)[0];
    return { prochain, derive: previsions(h, machine, now)[0], derniere, now };
  }, [machine, machines, saisies, toutes, id]);

  if (!machine) return null;
  const model = machineModel(machine, perso);
  const type = MACHINE_TYPES[machine.type];
  const etat = etatAffiche(live);
  const now = Date.now();
  // Pannes réglées pendant la session, il y a moins de dix minutes : leur fiche reste, close.
  const closes = toutes.filter((a) => a.machineId === id && a.statut === 'resolue' && a.gravite === 'critique' && a.finLe !== undefined && now - a.finLe < FICHE_CLOSE_MS);
  const dernierePanne = suivi?.derniere && suivi.derniere.gravite === 'critique' && !closes.some((a) => a.id === suivi.derniere!.id) ? suivi.derniere : undefined;
  const enCause = alarmes[0] ? model.organes.find((o) => o.id === alarmes[0].organeId)?.nom : undefined;
  const phrase = phraseMachine(live, etat, enCause, now);
  const vitesse = motVitesse(etat, live?.facteur ?? 0);
  const jetees = live && live.bonnes + live.gache > 0 ? Math.round((live.gache / (live.bonnes + live.gache)) * 1000) / 10 : undefined;
  const nomOrgane = (organeId: string) => model.organes.find((o) => o.id === organeId)?.nom;
  const entre = (nom: string | undefined) => (nom ? ` (${minusculeInitiale(nom)})` : '');

  const suiviItems: ChiffreSecondaire[] = [];
  if (suivi?.derniere) {
    const d = suivi.derniere;
    const organe = nomOrgane(d.organeId);
    suiviItems.push({
      label: 'Dernière alarme',
      valeur: quandCourt(d.horodatage, suivi.now),
      aide: `${d.code}, ${minusculeInitiale(d.message)}${organe ? `, côté ${minusculeInitiale(organe)}` : ''}, ${quand(d.horodatage, suivi.now)}${d.finLe ? `. Réglée en ${fmtDuration(d.finLe - d.horodatage)}` : ''}.`,
    });
  }
  if (suivi?.derive) {
    const d = suivi.derive;
    suiviItems.push({
      label: 'Dérive repérée',
      terme: 'derive',
      valeur: fmtEcheance(d.franchissement, suivi.now),
      ton: 'warn',
      aide: `${d.libelle}${entre(d.organeNom)} glisse vers sa limite ${d.niveau === 'alarme' ? 'd’alarme' : 'd’attention'}.`,
    });
  }
  if (suivi?.prochain) {
    const p = suivi.prochain;
    suiviItems.push({
      label: 'Prochain entretien',
      valeur: fmtEcheance(p.echeance!, suivi.now),
      ton: p.statut === 'en_retard' ? 'crit' : undefined,
      aide: `${p.tache}${entre(p.organeNom)}.`,
    });
  }

  return (
    <div className="sv-detail stack">
      <header className="sv-detail-tete">
        <div>
          <p className="sv-detail-type">{type?.procede ?? 'Machine'}</p>
          <h3>
            {machine.numero} · {machine.nom}
          </h3>
        </div>
        <StatusPill etat={etat} label={live?.horsLigne ? LIBELLE_HORS_LIGNE : ETAT_MOT[etat]} />
      </header>
      {/* Une alarme en cours a sa fiche juste dessous, qui dit déjà quoi, où et depuis quand. */}
      {phrase && !alarmes.length && (
        <p className="sv-detail-phrase">
          {live && (
            <span className={`st st-${live.horsLigne ? 'attention' : etat}`}>
              <StatusIcon etat={live.horsLigne ? 'attention' : etat} size={12} animate={false} />
            </span>
          )}
          <span>{phrase.texte}</span>
        </p>
      )}

      <div className="reperes sv-detail-reperes">
        <Repere
          className="sv-rep"
          titre="Vitesse"
          aide={type ? `Sa vitesse normale : ${fmtValue(type.vitesse.nominale)} ${type.vitesse.unite}.` : undefined}
          valeur={Math.round(live?.vitesse ?? 0)}
          unite={type?.vitesse.unite}
          ton={vitesse.ton}
          mot={vitesse.mot}
          jauge={Math.min(1, live?.facteur ?? 0)}
          note={live && (etat === 'marche' || etat === 'attention') ? `En ce moment, ${Math.round(live.facteur * 100)} % de sa vitesse normale.` : undefined}
        />
        <Repere
          className="sv-rep"
          titre="Étiquettes jetées"
          terme="gache"
          valeur={jetees ?? '…'}
          format={(v) => v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          unite="%"
          note={`Part jetée ${depuisCompteurs(source, debutDePoste(now))}.`}
        />
      </div>

      {[...alarmes, ...closes].map((a) => (
        <div key={a.id} className={`card sv-detail-alarme ${a.statut === 'resolue' ? 'close' : estExercice(a) ? 'exercice' : a.gravite === 'critique' ? 'crit' : ''}`}>
          <AlarmCard a={a} compact />
          {a.statut !== 'resolue' && !(focus.kind === 'organe' && focus.organeId === a.organeId) && (
            <button className="btn sm" onClick={() => focusAlarm(a.id)}>
              <LocateFixed /> Montrer l’organe sur le plan
            </button>
          )}
        </div>
      ))}

      <section aria-labelledby={`organes-${id}`} className="sv-detail-organes">
        <TitreCarte
          id={`organes-${id}`}
          titre="Ses organes, en direct"
          aide="Chaque partie de la machine que surveille EVAN, avec ses mesures des dernières minutes. Un clic la montre sur le plan."
        />
        <ul className="sv-organes">
          {model.organes.map((o) => {
            const pts = model.points.filter((p) => p.organeId === o.id && p.type !== 'alarme');
            const al = alarmes.find((a) => a.organeId === o.id);
            const horsPlage = pts.some((p) => values[p.id] && values[p.id].niveau !== 'ok');
            const e: EtatMachine = al?.gravite === 'critique' ? 'panne' : al || horsPlage ? 'attention' : 'marche';
            const mot = e === 'panne' ? 'En défaut' : e === 'attention' ? 'À surveiller' : 'Normal';
            const exercice = !!al && estExercice(al);
            return (
              <li key={o.id}>
                <button
                  className={`sv-organe ${e === 'panne' && !exercice ? 'crit' : ''} ${exercice ? 'exercice' : ''}`}
                  onClick={() => useUi.getState().setFocus({ kind: 'organe', machineId: machine.id, organeId: o.id })}
                >
                  <span className="sv-organe-tete">
                    <span className="sv-organe-nom">
                      {o.numero}. {o.nom}
                    </span>
                    {/* Normal : la forme seule, calme. Hors de la normale : la forme et le mot. */}
                    <span className={`sv-organe-etat st st-${e}`} title={mot}>
                      <StatusIcon etat={e} size={10} animate={false} />
                      {e === 'marche' ? <span className="sr-only">{mot}</span> : mot}
                    </span>
                  </span>
                  {pts.map((p) => {
                    const v = values[p.id];
                    const couleur = couleurMesure(v?.niveau);
                    return (
                      <span key={p.id} className="sv-point">
                        <span className="sv-point-nom">{p.libelle}</span>
                        <Sparkline values={getSeries(p.id).v} seuils={p.seuils} width={78} height={22} color={couleur} />
                        <span className="sv-point-valeur num" style={v && v.niveau !== 'ok' ? { color: couleur } : undefined}>
                          {v ? fmtValue(v.v, p.unite) : '…'}
                        </span>
                      </span>
                    );
                  })}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {suiviItems.length > 0 && (
        <section className="sv-suivi" aria-label="Historique et entretien">
          <ChiffresSecondaires items={suiviItems} label="Historique et entretien" />
          {suivi?.derniere?.simulee && (
            <p className="sv-volet-simule">
              <SimulatedChip />
            </p>
          )}
        </section>
      )}

      <div className="row wrap">
        {dernierePanne && (
          <button className="btn sm" onClick={() => openReplay(dernierePanne)}>
            <HistoryIcon /> Revoir la dernière panne
          </button>
        )}
        <button className="btn sm" onClick={() => void openPage(8, machine.id)}>
          <Wrench /> Carnet de maintenance
        </button>
        <button className="btn sm" onClick={() => void openPage(9, machine.id)}>
          <PlugZap /> Énergie
        </button>
      </div>

      <details className="card diag-card" open={diagnostic} onToggle={(e) => useUi.getState().setDiagnosticMachineId((e.target as HTMLDetailsElement).open ? machine.id : undefined)}>
        <summary>
          <Ruler size={16} aria-hidden /> Un défaut revient ? Trouver la pièce en cause
        </summary>
        <RepeatDefectTool
          machine={machine}
          compact
          onLocate={(n) => useUi.getState().setFocus({ kind: 'organe', machineId: machine.id, organeId: `${machine.id}.o${n}` })}
        />
      </details>
    </div>
  );
}
