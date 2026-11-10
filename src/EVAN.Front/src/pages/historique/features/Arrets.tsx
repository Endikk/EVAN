/**
 * Où part le temps : les arrêts par machine (pannes et réglages), la carte de l'atelier teintée par les pannes,
 * et les organes qui tombent le plus en panne. Le survol d'une machine dans le graphique la désigne sur la carte
 * (et inversement) ; ce lien reste local à ces deux cartes pour ne pas redessiner tout l'écran au survol.
 */
import { useMemo, useState } from 'react';
import type { Machine } from '@/domain/types';
import { HBarChart, type BarSeries } from '@/widgets/charts/charts';
import { HeatPlan } from '@/widgets/charts/HeatPlan';
import { H } from '@/sim/history';
import type { LigneMachine, LigneOrgane } from '../lib/calculs';
import { leconArrets, leconCarte, leconOrganes } from '../lib/phrases';
import { useEtroit } from '../lib/useEtroit';
import { Carte } from './Carte';

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const enHeures = (v: number) => `${nf1.format(v)} h`;

/** Une panne se dessine en couleur de panne, pleine ; un réglage en couleur de calage, hachuré. Ce que veut dire
 *  chacun est dans le « ? » de la carte : la légende ne donne que les noms. */
const SERIES_ARRETS: BarSeries[] = [
  { label: 'Panne', color: 'var(--crit)' },
  { label: 'Réglage', color: 'var(--setup)', motif: 'hachures' },
];
const SERIE_PANNE: BarSeries[] = [{ label: 'Panne', color: 'var(--crit)' }];

interface ArretsProps {
  lignes: LigneMachine[];
  zoneDe(m: Machine): string | undefined;
  selectionId: string;
  onChoisir(id: string): void;
  rang: number;
}

export function ArretsEtCarte({ lignes, zoneDe, selectionId, onChoisir, rang }: ArretsProps) {
  const [survol, setSurvol] = useState<string>();
  const donnees = useMemo(
    () =>
      [...lignes]
        .sort((a, b) => b.panne + b.calage - (a.panne + a.calage))
        .map((l) => {
          const zone = zoneDe(l.m);
          return { id: l.m.id, label: l.m.numero, sub: zone ? `${l.m.nom} · ${zone}` : l.m.nom, values: [l.panne / H, l.calage / H] };
        }),
    [lignes, zoneDe],
  );
  const chaleur = useMemo(() => Object.fromEntries(lignes.map((l) => [l.m.id, l.panne])), [lignes]);
  const selection = lignes.find((l) => l.m.id === selectionId);

  return (
    <>
      <Carte
        titre="Temps d’arrêt par machine"
        aide="En plein, les pannes (arrêts non prévus) ; en hachuré, les réglages quand on change de travail. Un clic sur une machine filtre tout l’écran, un second revient à l’atelier."
        lecon={leconArrets(lignes, selection)}
        span={7}
        rang={rang}
        guide="arrets-machines"
        tour="arrets-machines"
      >
        <HBarChart
          data={donnees}
          series={SERIES_ARRETS}
          fmt={enHeures}
          onClick={onChoisir}
          onHover={setSurvol}
          selectedId={selectionId || undefined}
          highlightId={survol}
          labelWidth={64}
          subsInTip
        />
      </Carte>
      <Carte
        titre="Carte des arrêts"
        aide="Plus une machine est rouge foncé, plus elle a passé de temps en panne. Le chiffre sous chaque machine donne ces heures ; un clic la choisit."
        lecon={leconCarte(lignes)}
        span={5}
        rang={rang + 1}
        guide="carte"
        className="map-card"
      >
        <HeatPlan heat={chaleur} selectedId={selectionId || undefined} highlightId={survol} onHover={setSurvol} onMachineClick={onChoisir} />
      </Carte>
    </>
  );
}

interface OrganesProps {
  organes: LigneOrgane[];
  totalPanne: number;
  machine?: Machine;
  rang: number;
}

export function PannesParOrgane({ organes, totalPanne, machine, rang }: OrganesProps) {
  const etroit = useEtroit();
  const donnees = useMemo(() => organes.map((o) => ({ id: o.id, label: o.nom, sub: o.type, values: [o.ms / H] })), [organes]);
  return (
    <Carte
      titre="Pannes par organe"
      terme="organe"
      aide={machine ? `Les pannes de ${machine.numero} seulement, sans les réglages.` : 'Les pannes seulement, sans les réglages. Les organes de même nom sont regroupés par type de machine.'}
      lecon={leconOrganes(organes, totalPanne)}
      span={5}
      rang={rang}
      guide="organes"
    >
      {donnees.length ? <HBarChart data={donnees} series={SERIE_PANNE} fmt={enHeures} labelWidth={etroit ? 130 : 170} /> : <p className="muted">Aucune panne sur la période.</p>}
    </Carte>
  );
}
