/**
 * Historique (espace d'exploitation) : une phrase qui résume la période, trois repères, puis où le temps s'est
 * perdu, l'efficacité des machines, les mesures et les alarmes. La période et la machine choisies pilotent tout
 * l'écran ; un clic sur une machine (barre ou carte) revient à la choisir.
 *
 * Les agrégats sont calculés une fois par changement (période, machine, alarmes en direct), jamais à chaque rendu.
 */
import { niveauDe } from '@/domain/niveaux';
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { History as IconeHistorique, Zap } from 'lucide-react';
import { useProject } from '@/store/project';
import { useLive } from '@/store/live';
import { useUi } from '@/store/ui';
import { machineModel } from '@/domain/catalog';
import type { Alarme, Machine } from '@/domain/types';
import { getHistory, H, markRepetitive } from '@/sim/history';
import { pointInPolygon } from '@/geo/geodesy';
import { PageIntro, montrerBloc } from '@/ui/explain';
import { Filtres } from '@/widgets/charts/Filtres';
import { openPage } from '@/widgets/shell/navigation';
import { bilan, bilanAlarmes, critiquesParTranche, ligneMachine, pannesParOrgane, pannesRecurrentes, trsParJour, type Periode } from '../lib/calculs';
import { minusculeInitiale, verdictHistorique } from '../lib/phrases';
import { useEtroit } from '../lib/useEtroit';
import { Reperes } from './Reperes';
import { ArretsEtCarte, PannesParOrgane } from './Arrets';
import { Courbe } from './Courbe';
import { EfficaciteJours, EfficaciteMachines } from './Efficacite';
import { AlarmesParJour, PannesRecurrentes } from './Alarmes';
import { Journal } from './Journal';
import { guideHistorique } from './guide';

/** Étape de l'historique dans la navigation (openPage(7, …)). */
const ETAPE_HISTORIQUE = 7;

function Section({ titre, rang }: { titre: string; rang: number }) {
  return (
    <h2 className="hist-section span-12 entree" style={{ '--i': rang } as CSSProperties}>
      {titre}
    </h2>
  );
}

export function HistoryView() {
  const machines = useProject((s) => s.machines);
  const perso = useProject((s) => s.perso);
  const zones = useProject((s) => s.zones);
  const live = useLive((s) => s.alarms);
  const [periode, setPeriode] = useState<Periode>('7j');
  const [machineId, setMachineId] = useState('');
  const [pointId, setPointId] = useState('');

  // Machine désignée par un autre écran ou par la visite guidée : l'écran se filtre sur elle.
  const pageMachineId = useUi((s) => s.pageMachineId);
  useEffect(() => {
    // « Voir son énergie » pose la machine pour l'écran Énergie pendant que celui-ci est encore affiché : il ne la prend
    // que s'il est bien l'écran ouvert.
    if (!pageMachineId || useUi.getState().step !== ETAPE_HISTORIQUE) return;
    setMachineId(pageMachineId);
    setPointId('');
    useUi.getState().setPageMachineId(undefined);
  }, [pageMachineId]);

  const h = useMemo(() => getHistory(machines), [machines]);
  // « Maintenant » n'avance que quand l'écran a une raison de changer (alarmes en direct, période) : sans ça,
  // chaque survol recalculerait toute la semaine.
  const now = useMemo(() => Date.now(), [h, live, periode]);
  const from = periode === '24h' ? now - 24 * H : h.debut;

  const modeles = useMemo(() => new Map(machines.map((m) => [m.id, machineModel(m, perso[m.id])])), [machines, perso]);
  const avecHistorique = useMemo(() => machines.filter((m) => !m.creeLe), [machines]);
  const lignesTous = useMemo(() => avecHistorique.map((m) => ligneMachine(h, m, from, now)), [avecHistorique, h, from, now]);
  const lignes = useMemo(() => (machineId ? lignesTous.filter((l) => l.m.id === machineId) : lignesTous), [lignesTous, machineId]);
  const b = useMemo(() => bilan(lignes), [lignes]);
  // L'atelier entier, pour situer la machine choisie (durée moyenne d'un réglage).
  const bTous = useMemo(() => bilan(lignesTous), [lignesTous]);

  const alarmesTous = useMemo(
    () =>
      markRepetitive([...live.filter((a) => a.gravite === 'critique' || a.regle === 'derive'), ...h.alarmes])
        .filter((a) => a.horodatage >= from)
        .sort((a, b) => b.horodatage - a.horodatage),
    [live, h, from],
  );
  const alarmes = useMemo(() => (machineId ? alarmesTous.filter((a) => a.machineId === machineId) : alarmesTous), [alarmesTous, machineId]);
  const ba = useMemo(() => bilanAlarmes(alarmes), [alarmes]);
  const organes = useMemo(() => pannesParOrgane(lignes, modeles, !!machineId), [lignes, modeles, machineId]);
  const jours = useMemo(() => trsParJour(lignes, h, from), [lignes, h, from]);
  const critiquesJour = useMemo(() => critiquesParTranche(alarmes, periode, from, now), [alarmes, periode, from, now]);
  const recurrentes = useMemo(() => pannesRecurrentes(alarmes, machines, now), [alarmes, machines, now]);

  const machine = machines.find((m) => m.id === machineId);
  // Sans machine choisie, la courbe montre la flexo de l'atelier (celle de la visite guidée).
  const machineCourbe = machine ?? avecHistorique.find((m) => m.type === 'flexo') ?? avecHistorique[0];
  const modeleCourbe = machineCourbe && modeles.get(machineCourbe.id);

  /** Clic sur une machine dans un graphique ou sur la carte : la choisir, ou revenir à tout l'atelier. */
  const basculer = useCallback((id: string) => {
    setMachineId((cur) => (cur === id ? '' : id));
    setPointId('');
  }, []);
  const choisir = useCallback((id: string) => {
    setMachineId(id);
    setPointId('');
  }, []);
  const zoneDe = useCallback((m: Machine) => zones.find((z) => niveauDe(z) === niveauDe(m) && pointInPolygon(m.position, z.polygone))?.nom, [zones]);
  const organeDe = useCallback((mid: string, oid: string) => modeles.get(mid)?.organes.find((o) => o.id === oid)?.nom, [modeles]);
  const voirCourbe = useCallback((a: Alarme) => {
    setMachineId(a.machineId);
    setPointId(a.pointId ?? '');
    window.setTimeout(() => montrerBloc('courbe'), 150);
  }, []);

  const organeVerdict = machine && organes[0] ? minusculeInitiale(organes[0].nom.replace(/^\d+\.\s*/, '')) : undefined;
  const v = verdictHistorique(periode, b, machine, organeVerdict, bTous);
  // Sur téléphone, la carte des arrêts n'est pas montrée (le graphique des arrêts dit la même chose, lisible) : le
  // guide ne la présente pas.
  const etroit = useEtroit();
  const reglagesDabord = b.calage >= b.panne;
  const guide = useMemo(() => guideHistorique({ D: b.D, P: b.P, Q: b.Q }, { carte: !etroit, reglagesDabord }), [b.D, b.P, b.Q, etroit, reglagesDabord]);
  const lienEnergie = machine && (
    <button type="button" className="btn sm ghost hf-lien" onClick={() => void openPage(9, machine.id)}>
      <Zap aria-hidden /> Voir son énergie
    </button>
  );

  return (
    <div className="history hist">
      <PageIntro titre="Historique" icone={IconeHistorique} verdict={v.verdict} ton={v.ton} suite={v.suite} guide={guide} simule />
      <Filtres periode={periode} onPeriode={setPeriode} machineId={machineId} onMachine={choisir} machines={machines} rang={1} lien={lienEnergie} />
      <Reperes b={b} machine={machine} ba={ba} machines={machines} organeDe={organeDe} rang={2} />

      <div className="history-grid hist-grille">
        <Section titre="Où le temps s’est perdu" rang={4} />
        <ArretsEtCarte lignes={lignesTous} zoneDe={zoneDe} selectionId={machineId} onChoisir={basculer} carte={!etroit} rang={5} />
        <PannesParOrgane organes={organes} totalPanne={b.panne} machine={machine} rang={7} />
        <PannesRecurrentes pannes={recurrentes} rang={8} />

        <Section titre="L’efficacité des machines" rang={9} />
        <EfficaciteMachines lignes={lignesTous} selectionId={machineId} onChoisir={basculer} rang={10} />
        <EfficaciteJours
          jours={jours}
          periode={periode}
          perimetre={machine ? `${machine.numero} seulement.` : 'Toutes les machines, pondérées par leur temps d’ouverture.'}
          rang={11}
        />

        <Section titre="Les mesures et les alarmes" rang={12} />
        {machineCourbe && modeleCourbe && (
          <Courbe
            h={h}
            machine={machineCourbe}
            modele={modeleCourbe}
            pointId={pointId}
            onPoint={setPointId}
            alarmes={alarmesTous}
            periode={periode}
            from={from}
            now={now}
            filtree={!!machine}
            rang={13}
          />
        )}
        <AlarmesParJour tranches={critiquesJour} periode={periode} rang={14} />
        <Journal alarmes={alarmes} machines={machines} modeles={modeles} periode={periode} now={now} onVoirCourbe={voirCourbe} rang={15} />
      </div>
    </div>
  );
}
