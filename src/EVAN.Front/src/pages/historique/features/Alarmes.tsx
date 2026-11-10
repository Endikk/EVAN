/**
 * Les alarmes dans le temps : combien d'alarmes critiques chaque jour, puis les pannes qui reviennent le plus,
 * comptées en nombre de fois ou en temps perdu (un seul graphique, deux façons de compter).
 */
import { useMemo, useState } from 'react';
import { fmtDay } from '@/ui/format';
import { DayColumns, HBarChart, type BarSeries } from '@/widgets/charts/charts';
import { H } from '@/sim/history';
import type { PanneRecurrente } from '../lib/calculs';
import { leconAlarmesJour, leconRecurrentes } from '../lib/phrases';
import { useEtroit } from '../lib/useEtroit';
import { Carte } from './Carte';

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const SERIE_FOIS: BarSeries[] = [{ label: 'Nombre de fois', color: 'var(--crit)' }];
const SERIE_DUREE: BarSeries[] = [{ label: 'Temps perdu', color: 'var(--crit)' }];
const LIMITE = 8;

export function AlarmesParJour({ jours, rang }: { jours: { t: number; v: number }[]; rang: number }) {
  return (
    <Carte
      titre="Alarmes critiques par jour"
      aide="Une alarme critique arrête la machine. Le détail de chaque jour est dans le journal, plus bas."
      lecon={leconAlarmesJour(jours, fmtDay)}
      span={4}
      rang={rang}
      guide="alarmes-jour"
    >
      <DayColumns data={jours} label="alarmes critiques" color="var(--crit)" fmtDay={fmtDay} />
    </Carte>
  );
}

export function PannesRecurrentes({ pannes, rang }: { pannes: PanneRecurrente[]; rang: number }) {
  const [parDuree, setParDuree] = useState(false);
  const etroit = useEtroit();
  const tri = useMemo(() => [...pannes].sort((a, b) => (parDuree ? b.ms - a.ms : b.n - a.n)).slice(0, LIMITE), [pannes, parDuree]);
  const donnees = useMemo(
    () => tri.map((p) => ({ id: p.id, label: p.message, sub: `${p.numero} · code ${p.code}`, values: [parDuree ? p.ms / H : p.n] })),
    [tri, parDuree],
  );
  const bascule = (
    <div className="seg" role="group" aria-label="Compter les pannes">
      <button type="button" aria-pressed={!parDuree} onClick={() => setParDuree(false)}>
        Nombre de fois
      </button>
      <button type="button" aria-pressed={parDuree} onClick={() => setParDuree(true)}>
        Temps perdu
      </button>
    </div>
  );
  return (
    <Carte
      titre="Les pannes qui reviennent"
      aide="Chaque barre est une panne précise sur une machine, comptée en nombre de fois ou en temps perdu. Une panne qui revient a une cause pas encore réglée : c’est par elle qu’il faut commencer."
      lecon={leconRecurrentes(tri[0], parDuree)}
      span={7}
      rang={rang}
      guide="recurrentes"
      actions={bascule}
    >
      {donnees.length ? (
        <HBarChart
          key={parDuree ? 'duree' : 'fois'}
          data={donnees}
          series={parDuree ? SERIE_DUREE : SERIE_FOIS}
          fmt={(v) => (parDuree ? `${nf1.format(v)} h` : `${v} fois`)}
          labelWidth={etroit ? 140 : 230}
        />
      ) : (
        <p className="muted">Aucune panne sur la période.</p>
      )}
    </Carte>
  );
}
