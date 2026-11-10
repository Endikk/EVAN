/**
 * Courbe d'une mesure dans le temps, avec ses limites : la bande grise (plage normale), la ligne rouge (limite
 * d'alarme), les carrés rouges (alarmes levées). En tête, la machine et l'organe suivis à côté du choix de la
 * mesure ; la lecture est dans le « ? ». La leçon ne compte que le temps de production : la nuit, une tension de
 * bande à zéro n'est pas un défaut.
 */
import { useMemo } from 'react';
import type { Alarme, Machine } from '@/domain/types';
import type { MachineModel } from '@/domain/catalog';
import { historicSeries, MIN, type History } from '@/sim/history';
import { fmtDay, fmtDayTime, fmtHM } from '@/ui/format';
import { Select } from '@/ui/Select';
import { MeasureChart } from '@/widgets/charts/charts';
import { graduationsTemps, tenueMesure, type Periode } from '../lib/calculs';
import { leconCourbe } from '../lib/phrases';
import { Carte } from './Carte';

/** Les types de point qui ne font pas une courbe lisible (compteurs, états, usure, vitesse de ligne). */
const SANS_COURBE = new Set(['alarme', 'comptage', 'usure', 'vitesse']);

interface Props {
  h: History;
  machine: Machine;
  modele: MachineModel;
  pointId: string;
  onPoint(id: string): void;
  alarmes: Alarme[];
  periode: Periode;
  from: number;
  now: number;
  /** L'écran est filtré sur cette machine (sinon, c'est la machine montrée par défaut). */
  filtree: boolean;
  rang: number;
}

export function Courbe({ h, machine, modele, pointId, onPoint, alarmes, periode, from, now, filtree, rang }: Props) {
  const point = modele.points.find((p) => p.id === pointId) ?? modele.points.find((p) => !SANS_COURBE.has(p.type));
  const pas = periode === '24h' ? 5 * MIN : 30 * MIN;
  const serie = useMemo(() => (point ? historicSeries(h, machine, point, from, now, pas).map((p) => ({ t: p.t, v: p.v })) : []), [h, machine, point, from, now, pas]);
  const tenue = useMemo(() => (point ? tenueMesure(serie, point.seuils, h, machine.id) : undefined), [serie, point, h, machine.id]);
  const graduations = useMemo(() => graduationsTemps(periode, from, now), [periode, from, now]);
  const reperes = useMemo(
    () => alarmes.filter((a) => a.machineId === machine.id && a.pointId === point?.id).map((a) => ({ t: a.horodatage, label: `${a.code} · ${fmtDayTime(a.horodatage)}` })),
    [alarmes, machine.id, point?.id],
  );

  const organe = point && modele.organes.find((o) => o.id === point.organeId)?.nom;
  // La légende nomme la plage et la limite ; le « ? » dit ce qui ne se voit pas.
  const aide = [
    tenue?.creuxALArret && 'Les creux tombent quand la machine est arrêtée, la nuit par exemple : la leçon ne les compte pas.',
    !filtree && 'Pour une autre machine, choisissez-la dans « Machine », en haut.',
  ]
    .filter(Boolean)
    .join(' ');

  // Les mesures à tracer, rangées par organe (un organe sans mesure n'apparaît pas).
  const mesures = useMemo(
    () =>
      modele.organes
        .map((o) => ({
          groupe: `${o.numero}. ${o.nom}`,
          options: modele.points.filter((p) => p.organeId === o.id && p.type !== 'alarme').map((p) => ({ value: p.id, label: `${p.libelle} (${p.unite})` })),
        }))
        .filter((g) => g.options.length > 0),
    [modele],
  );

  const choix = (
    <div className="hc-suivi">
      <span className="hc-contexte" title={`${machine.numero} ${machine.nom}`}>
        <b>{machine.numero}</b>
        {organe && ` · ${organe}`}
      </span>
      <label className="hc-choix">
        <span className="sr-only">Mesure suivie</span>
        <Select taille="sm" value={point?.id ?? ''} onChange={onPoint} options={mesures} />
      </label>
    </div>
  );

  return (
    <Carte
      titre="Courbe de mesure"
      terme="plageNormale"
      aide={aide || undefined}
      lecon={point ? leconCourbe(tenue?.part, reperes.length) : undefined}
      span={8}
      rang={rang}
      guide="courbe"
      tour="courbe"
      actions={choix}
    >
      {point ? (
        <MeasureChart
          data={serie}
          seuils={point.seuils}
          unite={point.unite}
          markers={reperes}
          ticks={graduations}
          fmtX={(t) => (periode === '24h' ? fmtHM(t) : fmtDay(t))}
          fmtTip={fmtDayTime}
          legende
        />
      ) : (
        <p className="muted">Cette machine n’a pas de mesure à tracer.</p>
      )}
    </Carte>
  );
}
