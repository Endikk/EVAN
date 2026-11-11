/**
 * Où part le temps : les arrêts par machine (pannes et réglages), la carte de l'atelier teintée par les pannes,
 * et les organes qui tombent le plus en panne. Le survol d'une machine dans le graphique la désigne sur la carte
 * (et inversement) ; ce lien reste local à ces deux cartes pour ne pas redessiner tout l'écran au survol.
 *
 * Sur téléphone, la carte n'est pas montrée : ses étiquettes y deviendraient illisibles, et le graphique des arrêts dit
 * déjà, machine par machine, le temps perdu en pannes.
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
import { nommerClic } from './nommerClic';

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const enHeures = (v: number) => `${nf1.format(v)} h`;

/** Une panne se dessine en couleur de panne, un réglage en couleur de calage : deux états qui ont un sens partout
 *  dans EVAN, avec leur forme dans la légende (carré, losange). Ce que veut dire chacun est dans le « ? » de la
 *  carte : la légende ne donne que les noms. */
const SERIES_ARRETS: BarSeries[] = [
  { label: 'Panne', color: 'var(--crit)' },
  { label: 'Réglage', color: 'var(--setup)' },
];
const SERIE_PANNE: BarSeries[] = [{ label: 'Panne', color: 'var(--crit)' }];

interface ArretsProps {
  lignes: LigneMachine[];
  zoneDe(m: Machine): string | undefined;
  selectionId: string;
  onChoisir(id: string): void;
  /** Montrer la carte des arrêts à côté du graphique (pas sur téléphone). */
  carte: boolean;
  rang: number;
}

export function ArretsEtCarte({ lignes, zoneDe, selectionId, onChoisir, carte, rang }: ArretsProps) {
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
        aide="En rouge, les pannes (arrêts non prévus) ; en bleu, les réglages quand on change de travail. Un clic sur une machine filtre tout l’écran, un second revient à l’atelier."
        lecon={leconArrets(lignes, selection)}
        span={carte ? 7 : 12}
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
          nom="Temps d’arrêt par machine"
          nommerClic={nommerClic}
        />
      </Carte>
      {carte && (
        <Carte
          titre="Carte des arrêts"
          aide="Plus le rouge d’une machine est soutenu, plus elle a passé de temps en panne, en cinq paliers comme la légende. Le chiffre sous chaque machine donne ces heures quand la place le permet ; le survol les donne toujours. Un clic la choisit."
          lecon={leconCarte(lignes)}
          span={5}
          rang={rang + 1}
          guide="carte-arrets"
          className="map-card"
        >
          <HeatPlan heat={chaleur} selectedId={selectionId || undefined} highlightId={survol} onHover={setSurvol} onMachineClick={onChoisir} />
        </Carte>
      )}
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
  // Un organe regroupé par type : la bulle dit sur quelles machines il est tombé en panne, et combien de temps.
  const donnees = useMemo(
    () =>
      organes.map((o) => ({
        id: o.id,
        label: o.nom,
        sub: o.type,
        values: [o.ms / H],
        tip: o.machines && (
          <ul className="hist-tip hist-tip-liste">
            {o.machines.map((x) => (
              <li key={x.numero}>
                <b>{x.numero}</b> <span className="num">{enHeures(x.ms / H)}</span>
              </li>
            ))}
          </ul>
        ),
      })),
    [organes],
  );
  return (
    <Carte
      titre="Pannes par organe"
      terme="organe"
      aide={
        machine
          ? `Les pannes de ${machine.numero} seulement, sans les réglages.`
          : 'Les pannes seulement, sans les réglages. Les organes de même nom sont regroupés par type de machine ; survolez une barre pour voir sur quelles machines.'
      }
      lecon={leconOrganes(organes, totalPanne)}
      span={5}
      rang={rang}
      guide="organes"
    >
      {donnees.length ? (
        <HBarChart data={donnees} series={SERIE_PANNE} fmt={enHeures} labelWidth={etroit ? 130 : 170} nom="Pannes par organe" />
      ) : (
        <p className="muted">Aucune panne sur la période.</p>
      )}
    </Carte>
  );
}
