/**
 * Carnet de maintenance (espace d'exploitation). L'écran répond d'abord à « quel entretien faire en premier ? »,
 * puis montre la liste des entretiens par urgence, les dérives repérées par EVAN, le journal des interventions avec
 * la panne rejouable, les machines une par une et le diagnostic des défauts répétitifs.
 *
 * Il se lit d'un coup d'œil : sous un chiffre, aucune phrase ; la méthode et les définitions sont dans les « ? ».
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardCheck, Wrench } from 'lucide-react';
import { useProject } from '@/store/project';
import { useLive } from '@/store/live';
import { useCarnet } from '@/store/carnet';
import { useUi } from '@/store/ui';
import { MACHINE_TYPES } from '@/domain/catalog';
import { DAY, getHistory } from '@/sim/history';
import { echeances, indicateurs, journal, previsions, type Echeance } from '@/analytics/maintenance';
import { showOrgan } from '@/widgets/shell/navigation';
import { useNow } from '@/ui/useNow';
import { ChiffresSecondaires, montrerBloc, PageIntro, Repere, TitreCarte, type ChiffreSecondaire } from '@/ui/explain';
import { fmtDuration, pct } from '@/ui/format';
import { AnimatedNumber } from '@/ui/anim';
import { Select } from '@/ui/Select';
import { RepeatDefectTool } from '@/widgets/pannes/RepeatDefectTool';
import { grouperParUrgence, urgence, verdictMaintenance } from '../lib/carnet';
import { GUIDE_MAINTENANCE } from './guide';
import { TachesAFaire } from './TachesAFaire';
import { TacheLigne } from './TacheLigne';
import { TacheVolet } from './TacheVolet';
import { Previsions } from './Previsions';
import { Journal } from './Journal';
import { ParMachine } from './ParMachine';

const STATUT_ORDRE = { en_retard: 0, a_planifier: 1, ok: 2 } as const;

export function MaintenanceView() {
  const machines = useProject((s) => s.machines);
  const liveAlarms = useLive((s) => s.alarms);
  const saisies = useCarnet((s) => s.saisies);
  const tick = useNow(60_000);
  // L'heure suit aussi les saisies : un entretien consigné à l'instant compte tout de suite, sans attendre la minute.
  const now = useMemo(() => Date.now(), [tick, saisies]);
  // Machine présélectionnée par l'écran d'origine (« Voir le carnet »), consommée à l'ouverture.
  const [machineId, setMachineId] = useState(() => useUi.getState().pageMachineId ?? '');
  useEffect(() => useUi.getState().setPageMachineId(undefined), []);
  // Volet d'un entretien : on garde son identifiant pour qu'il suive les saisies (compteur remis à zéro).
  const [ouverteId, setOuverteId] = useState<string | null>(null);
  const declencheur = useRef<HTMLButtonElement | null>(null);

  const h = useMemo(() => getHistory(machines), [machines]);
  const byId = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const scope = useMemo(() => machines.filter((m) => !m.creeLe && (!machineId || m.id === machineId)), [machines, machineId]);
  const ech = useMemo(() => scope.flatMap((m) => echeances(h, m, now, saisies)), [h, scope, now, saisies]);
  const prev = useMemo(() => scope.flatMap((m) => previsions(h, m, now)), [h, scope, now]);
  const entries = useMemo(() => journal(h, scope, liveAlarms, saisies, now), [h, scope, liveAlarms, saisies, now]);
  const alarmes = useMemo(() => [...h.alarmes, ...liveAlarms.filter((a) => a.gravite === 'critique' && !a.id.startsWith('h-'))], [h, liveAlarms]);
  const kpi = useMemo(() => indicateurs(h, scope, entries, alarmes, h.debut, now), [h, scope, entries, alarmes, now]);
  const groupes = useMemo(() => grouperParUrgence(ech, now), [ech, now]);

  const machine = machineId ? byId.get(machineId) : undefined;
  const v = useMemo(
    () => verdictMaintenance({ groupes, previsions: prev, numero: (id) => byId.get(id)?.numero ?? id, now, machine: machine?.numero }),
    [groupes, prev, byId, now, machine],
  );
  const jours = Math.max(1, Math.round((now - h.debut) / DAY));
  const nRetard = groupes.retard.length;
  const nSemaine = groupes.semaine.length;
  const outilMachine = machine ?? machines.find((m) => m.type === 'flexo') ?? machines.find((m) => MACHINE_TYPES[m.type]?.organes.some((o) => o.cylindres.length));
  const ouverte = ouverteId ? ech.find((e) => e.id === ouverteId) : undefined;
  const machineOuverte = ouverte ? byId.get(ouverte.machineId) : undefined;
  // Le plan d'une machine suit le même ordre que « À faire » : par statut, puis par date, la plus ancienne d'abord.
  const plan = useMemo(
    () => [...ech].sort((a, b) => STATUT_ORDRE[a.statut] - STATUT_ORDRE[b.statut] || (a.echeance ?? now) - (b.echeance ?? now)),
    [ech, now],
  );

  // Chiffres de second rang : toujours visibles, une ligne, la définition et le détail dans leur « ? ».
  const autres: ChiffreSecondaire[] = [
    {
      label: 'Réponse aux alarmes',
      terme: 'acquittement',
      valeur: kpi.mtta ? <AnimatedNumber value={kpi.mtta} format={fmtDuration} /> : 'Aucune alarme',
      aide: kpi.mtta ? 'Temps moyen entre une alarme et le moment où quelqu’un indique qu’il s’en occupe.' : 'Aucune alarme prise en charge sur la période.',
    },
    {
      // Le nombre d'entretiens et de réparations est déjà sur les filtres du journal : il ne revient que dans le « ? ».
      label: 'Part de l’entretien',
      terme: 'preventif',
      valeur: <AnimatedNumber value={kpi.partPreventive} format={(x) => pct(x)} />,
      aide: `Sur le temps passé en intervention ces ${jours} jours, la part faite avant la panne ; le reste a servi à réparer. ${kpi.preventives} entretien${kpi.preventives > 1 ? 's' : ''}, ${kpi.curatives} réparation${kpi.curatives > 1 ? 's' : ''}.`,
    },
  ];

  const ouvrir = useCallback((e: Echeance, bouton: HTMLButtonElement) => {
    declencheur.current = bouton;
    setOuverteId(e.id);
  }, []);
  const fermer = useCallback(() => {
    setOuverteId(null);
    declencheur.current?.focus();
  }, []);

  const actions = (
    <>
      <Select
        className="mt-filtre"
        value={machineId}
        onChange={setMachineId}
        aria-label="Machine affichée"
        options={[{ value: '', label: 'Toutes les machines' }, ...machines.map((m) => ({ value: m.id, label: `${m.numero} · ${m.nom}` }))]}
      />
      <button type="button" className="btn primary" data-guide="consigner" onClick={() => useUi.getState().setSaisie({ machineId: machineId || undefined })}>
        <ClipboardCheck /> Consigner une intervention
      </button>
    </>
  );

  return (
    <div className="history maintenance mt">
      <PageIntro
        titre={machine ? `Carnet de maintenance · ${machine.numero} ${machine.nom}` : 'Carnet de maintenance'}
        icone={Wrench}
        verdict={v.verdict}
        ton={v.ton}
        suite={v.suite}
        guide={GUIDE_MAINTENANCE}
        actions={actions}
        simule
      />

      <div className="reperes mt-reperes entree" style={{ ['--i' as string]: 1 }} data-guide="reperes">
        <Repere
          titre="Entretiens à faire"
          valeur={nRetard + nSemaine}
          unite="d’ici 7 jours"
          ton={nRetard ? v.ton : nSemaine ? 'warn' : 'ok'}
          mot={nRetard ? `${nRetard} en retard` : nSemaine ? 'Rien en retard' : 'À jour'}
          aide="Les entretiens du plan en retard ou à faire dans les sept prochains jours."
          note={nRetard + nSemaine ? `${nRetard} en retard, ${nSemaine} à faire cette semaine.` : 'Rien à faire cette semaine.'}
          onClick={() => montrerBloc('a-faire')}
          guide="repere-a-faire"
        />
        <Repere
          titre="Temps entre deux pannes"
          terme="mtbf"
          valeur={kpi.mtbf ?? 'Aucune panne'}
          format={fmtDuration}
          unite={kpi.mtbf ? 'de marche' : undefined}
          note={kpi.pannes ? `${kpi.pannes} panne${kpi.pannes > 1 ? 's' : ''} en ${jours} jours, sur ${scope.length} machine${scope.length > 1 ? 's' : ''}.` : `Aucune panne en ${jours} jours.`}
        />
        <Repere
          titre="Temps pour réparer"
          terme="mttr"
          valeur={kpi.mttr ?? 'Aucune panne'}
          format={fmtDuration}
          unite={kpi.mttr ? 'en moyenne' : undefined}
          note={kpi.mttr ? 'De l’alarme à la remise en route de la machine.' : 'Aucune panne réparée sur la période.'}
        />
      </div>

      <div className="mt-chiffres entree" style={{ ['--i' as string]: 2 }}>
        <ChiffresSecondaires label="Autres chiffres de la maintenance" items={autres} />
      </div>

      <div className="history-grid mt-grille">
        <section className="card span-7 entree" style={{ ['--i' as string]: 3 }} data-tour="a-planifier" data-guide="a-faire">
          <TitreCarte
            titre="À faire"
            aide="Les entretiens du plan, du plus pressé au plus lointain. La barre compte l’usure depuis le dernier passage ; le trait marque l’échéance."
          />
          <TachesAFaire groupes={groupes} byId={byId} now={now} avecMachine={!machine} onOuvrir={ouvrir} />
        </section>

        <div className="span-5 mt-colonne entree" style={{ ['--i' as string]: 4 }}>
          <section className="card" data-tour="prevision" data-guide="prevision">
            <TitreCarte
              titre="Maintenance prévisionnelle"
              terme="previsionnel"
              aide="Pour chaque mesure qui glisse vers sa limite, EVAN prolonge la tendance jusqu’au seuil : le croisement donne la date avant laquelle intervenir."
            />
            <Previsions prev={prev} h={h} byId={byId} now={now} />
          </section>

          <section className="card" data-guide="par-machine">
            {machine ? (
              <>
                <TitreCarte
                  titre={`Plan de maintenance de ${machine.numero}`}
                  aide={`Toutes les tâches prévues pour ${MACHINE_TYPES[machine.type]?.nomKit ?? machine.nom}, à jour comprises.`}
                  actions={
                    <button type="button" className="btn sm" onClick={() => setMachineId('')}>
                      Toutes les machines
                    </button>
                  }
                />
                <ul className="mt-taches">
                  {plan.map((e) => (
                    <TacheLigne key={e.id} e={e} urgence={urgence(e, now)} machine={machine} now={now} avecMachine={false} onOuvrir={ouvrir} />
                  ))}
                </ul>
              </>
            ) : (
              <>
                <TitreCarte titre="Par machine" aide="Un clic sur une machine filtre l’écran sur elle : son plan complet, ses pannes, son temps entre deux pannes." />
                <ParMachine machines={scope} ech={ech} now={now} onPick={setMachineId} />
              </>
            )}
          </section>
        </div>

        <section className="card span-7 entree" style={{ ['--i' as string]: 5 }} data-tour="journal-interventions" data-guide="journal">
          <Journal entries={entries} byId={byId} alarmes={alarmes} depuis={h.debut} now={now} />
        </section>

        <section className="card span-5 entree" style={{ ['--i' as string]: 6 }} data-tour="defaut-repetitif" data-guide="defaut-repetitif">
          <TitreCarte
            titre="Défaut répétitif : quelle pièce ?"
            terme="defautRepetitif"
            aide="Un défaut qui revient au même pas sur la bande vient d’une pièce qui tourne."
            lecon={outilMachine ? `Machine étudiée : ${outilMachine.numero} ${outilMachine.nom}` : undefined}
          />
          {outilMachine ? (
            <RepeatDefectTool machine={outilMachine} onLocate={(n) => void showOrgan(outilMachine.id, `${outilMachine.id}.o${n}`)} />
          ) : (
            <p className="muted">Aucune machine à bande dans cette usine.</p>
          )}
        </section>
      </div>

      {ouverte && machineOuverte && (
        <TacheVolet e={ouverte} urgence={urgence(ouverte, now)} machine={machineOuverte} journal={entries} alarmes={alarmes} depuis={h.debut} now={now} fermer={fermer} />
      )}
    </div>
  );
}
