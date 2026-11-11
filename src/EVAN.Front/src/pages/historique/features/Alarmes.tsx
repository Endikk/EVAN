/**
 * Les alarmes dans le temps : combien d'alarmes critiques chaque jour (sur 24 heures, par tranche de 4 heures), puis
 * les pannes qui reviennent le plus, comptées en nombre de fois ou en temps perdu (un seul graphique, deux façons de
 * compter). Une panne survenue une seule fois n'y figure pas.
 */
import { useMemo, useState } from 'react';
import { fmtDay, fmtHM } from '@/ui/format';
import { DayColumns, HBarChart, type BarSeries } from '@/widgets/charts/charts';
import { H } from '@/sim/history';
import type { PanneRecurrente, Periode, TrancheAlarmes } from '../lib/calculs';
import { fmtJourAxe, leconAlarmesJour, leconRecurrentes } from '../lib/phrases';
import { useEtroit } from '../lib/useEtroit';
import { Carte } from './Carte';

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const SERIE_FOIS: BarSeries[] = [{ label: 'Nombre de fois', color: 'var(--crit)' }];
const SERIE_DUREE: BarSeries[] = [{ label: 'Temps perdu', color: 'var(--crit)' }];
const LIMITE = 8;

/** « de 16:00 à 20:00 » : une tranche de 4 heures, dite avec ses deux bornes. */
const enTranche = (j: TrancheAlarmes) => `de ${fmtHM(j.t)} à ${fmtHM(j.fin)}`;

export function AlarmesParJour({ tranches, periode, rang }: { tranches: TrancheAlarmes[]; periode: Periode; rang: number }) {
  const parTranche = periode === '24h';
  const parT = useMemo(() => new Map(tranches.map((j) => [j.t, j])), [tranches]);
  return (
    <Carte
      titre={parTranche ? 'Alarmes critiques par tranche de 4\u00a0h' : 'Alarmes critiques par jour'}
      aide={
        parTranche
          ? 'Une alarme critique arrête la machine. Sur 24 heures, une colonne par tranche de 4 heures : une colonne par jour mélangerait un jour entier et quelques heures. Le détail est dans le journal, plus bas.'
          : 'Une alarme critique arrête la machine. Le détail de chaque jour est dans le journal, plus bas.'
      }
      lecon={leconAlarmesJour(tranches, (j) => (parTranche ? enTranche(j) : fmtDay(j.t)), parTranche)}
      span={4}
      rang={rang}
      guide="alarmes-jour"
    >
      <DayColumns
        data={tranches}
        label="alarmes critiques"
        color="var(--crit)"
        fmtDay={parTranche ? fmtHM : fmtJourAxe}
        fmtTip={parTranche ? (t) => enTranche(parT.get(t) ?? { t, fin: t, v: 0 }) : fmtDay}
        nom={parTranche ? 'Alarmes critiques par tranche de 4 heures' : 'Alarmes critiques par jour'}
      />
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
      aide="Chaque barre est une panne précise sur une machine, revenue au moins deux fois sur la période, comptée en nombre de fois ou en temps perdu. Une panne qui revient a une cause pas encore réglée : c’est par elle qu’il faut commencer."
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
          nom="Les pannes qui reviennent"
        />
      ) : (
        <p className="muted">Aucune panne n’est revenue sur la période.</p>
      )}
    </Carte>
  );
}
