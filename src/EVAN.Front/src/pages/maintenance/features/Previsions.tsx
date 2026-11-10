/**
 * Maintenance prévisionnelle : une mesure qui glisse lentement vers sa limite, dite en une phrase, puis montrée.
 * La courbe relevée, puis la tendance prolongée qui se dessine jusqu'au seuil : le point où elles se croisent est la
 * date avant laquelle intervenir. Le rythme de la dérive, la valeur actuelle et l'organe sont dans le « ? ».
 */
import { useMemo } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { serieTendance, type Prevision } from '@/analytics/maintenance';
import { machineModel } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import type { History } from '@/sim/history';
import { useReducedMotion, useUi } from '@/store/ui';
import { InfoTip } from '@/ui/InfoTip';
import { TonGlyph } from '@/ui/explain';
import { fmtDay, fmtDayTime, fmtValue } from '@/ui/format';
import { uniteAxe } from '@/widgets/charts/axes';
import { fmtDateLongue, joursJusqua, minuscule } from '../lib/carnet';

const HEURE = 3_600_000;
/** La tendance se dessine après l'apparition de la carte, le point de croisement après la tendance. */
const TRACE_DEBUT_MS = 450;
const TRACE_DUREE_MS = 1400;

function dansCombien(t: number, now: number): string {
  const j = joursJusqua(t, now);
  return j <= 0 ? 'aujourd’hui' : j === 1 ? 'demain' : `dans ${j} jours`;
}

function Carte({ p, h, machine, now }: { p: Prevision; h: History; machine: Machine; now: number }) {
  const reduced = useReducedMotion();
  const point = useMemo(() => machineModel(machine).points.find((x) => x.id === p.pointId), [machine, p.pointId]);
  // Tendance coupée à l'instant présent : avant, elle résume les mesures ; après, c'est la projection qui se dessine.
  const data = useMemo(
    () =>
      point
        ? serieTendance(h, machine, point, now, p.franchissement + 86_400_000).map((d) => ({
            t: d.t,
            v: d.v,
            avant: d.t <= now ? d.tendance : undefined,
            apres: d.t >= now - HEURE ? d.tendance : undefined,
          }))
        : [],
    [h, machine, point, now, p.franchissement],
  );
  const bornes = useMemo(() => {
    const vals = data.flatMap((d) => [d.v, d.avant, d.apres]).filter((v): v is number => v !== undefined);
    const lo = Math.min(...vals, p.seuil);
    const hi = Math.max(...vals, p.seuil);
    const pad = (hi - lo) * 0.12 || 1;
    return [lo - pad, hi + pad] as [number, number];
  }, [data, p.seuil]);

  const alarme = p.niveau === 'alarme';
  const ton = alarme ? 'crit' : 'warn';
  const couleur = alarme ? 'var(--crit)' : 'var(--warn)';
  const sens = p.pente < 0 ? 'en baisse' : 'en hausse';
  const libelle = minuscule(p.libelle);
  const nomSeuil = alarme ? 'seuil d’alarme' : 'seuil d’attention';

  const planifier = () =>
    useUi.getState().setSaisie({
      machineId: p.machineId,
      organeId: p.organeId,
      type: 'preventive',
      titre: `Intervention sur ${p.organeNom.toLowerCase()} : ${libelle} en dérive`,
    });

  return (
    <article className={`mt-prev ton-${ton}`}>
      <p className="mt-prev-phrase">
        <TonGlyph ton={ton} />
        <span>
          {p.libelle} de {machine.numero} {sens} : {nomSeuil} <b>{dansCombien(p.franchissement, now)}</b>.
          <InfoTip label={`Comprendre : ${libelle} de ${machine.numero}`}>
            <p>
              Elle {p.pente < 0 ? 'perd' : 'prend'} {fmtValue(Math.abs(p.pente), p.unite)} par jour : de {fmtValue(p.valeur, p.unite)} aujourd’hui, elle atteindra son{' '}
              {nomSeuil} ({fmtValue(p.seuil, p.unite)}) vers le {fmtDateLongue(p.franchissement)}.
            </p>
            <p>Organe : {p.organeNom}.</p>
          </InfoTip>
        </span>
      </p>

      <div className="chart mt-prev-courbe" role="img" aria-label={`Courbe de ${libelle} sur ${machine.numero} : la tendance prolongée croise le seuil vers le ${fmtDateLongue(p.franchissement)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 22, right: 10, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmtDay}
              tick={{ fontSize: 11, fill: 'var(--text-3)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--grid)' }}
              minTickGap={40}
            />
            <YAxis
              domain={bornes}
              width={38}
              tickCount={3}
              tickFormatter={(v: number) => fmtValue(v)}
              tick={{ fontSize: 11, fill: 'var(--text-3)' }}
              tickLine={false}
              axisLine={false}
              label={p.unite ? uniteAxe(p.unite) : undefined}
            />
            <ReferenceLine y={p.seuil} stroke={couleur} strokeDasharray="4 3" ifOverflow="extendDomain" />
            <ReferenceLine
              x={now}
              stroke="var(--text-3)"
              strokeOpacity={0.6}
              label={{ value: 'aujourd’hui', position: 'insideTopLeft', fontSize: 11, fill: 'var(--text-3)' }}
            />
            <Tooltip
              cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                const d = payload?.[0]?.payload as { t: number; v?: number; avant?: number; apres?: number } | undefined;
                const tendance = d?.avant ?? d?.apres;
                return active && d ? (
                  <div className="chart-tip" style={{ position: 'static' }}>
                    <div className="faint">{fmtDayTime(d.t)}</div>
                    {d.v !== undefined && <b>Relevé : {fmtValue(d.v, p.unite)}</b>}
                    {tendance !== undefined && <div className="faint">Tendance : {fmtValue(tendance, p.unite)}</div>}
                  </div>
                ) : null;
              }}
            />
            <Line dataKey="v" stroke="var(--series-1)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="avant" stroke="var(--text-3)" strokeWidth={1.25} strokeDasharray="2 3" dot={false} isAnimationActive={false} />
            <Line
              dataKey="apres"
              className="mt-prev-projection"
              stroke={couleur}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={!reduced}
              animationBegin={TRACE_DEBUT_MS}
              animationDuration={TRACE_DUREE_MS}
              animationEasing="ease-out"
            />
            <ReferenceDot className="mt-prev-croise" x={p.franchissement} y={p.seuil} r={5} fill={couleur} stroke="var(--surface)" strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-prev-pied">
        <ul className="mt-legende" aria-label="Légende">
          <li>
            <svg width="22" height="8" aria-hidden>
              <path d="M1 4h20" stroke="var(--series-1)" strokeWidth="2" />
            </svg>
            Relevé
          </li>
          <li>
            <svg width="22" height="8" aria-hidden>
              <path d="M1 4h20" stroke={couleur} strokeWidth="2" strokeDasharray="6 4" />
            </svg>
            Tendance
          </li>
          <li>
            <svg width="22" height="8" aria-hidden>
              <path d="M1 4h20" stroke={couleur} strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            Seuil
          </li>
          <li>
            <svg width="10" height="10" aria-hidden>
              <circle cx="5" cy="5" r="4" fill={couleur} />
            </svg>
            Date limite
          </li>
        </ul>
        <button type="button" className="btn sm" onClick={planifier}>
          <ClipboardCheck /> Planifier l’intervention
        </button>
      </div>
    </article>
  );
}

export function Previsions({ prev, h, byId, now }: { prev: Prevision[]; h: History; byId: Map<string, Machine>; now: number }) {
  if (!prev.length) {
    return (
      <div className="empty">
        <b>Aucune dérive repérée</b>
        <span className="muted">Les mesures suivies restent stables sur la semaine.</span>
      </div>
    );
  }
  return (
    <div className="stack">
      {prev.map((p) => {
        const m = byId.get(p.machineId);
        return m ? <Carte key={p.pointId} p={p} h={h} machine={m} now={now} /> : null;
      })}
    </div>
  );
}
