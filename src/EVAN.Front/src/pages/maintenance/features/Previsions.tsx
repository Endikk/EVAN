/**
 * Maintenance prévisionnelle : une mesure qui glisse lentement vers sa limite, dite en une phrase, puis montrée.
 * La courbe relevée, puis la tendance prolongée qui se dessine jusqu'au seuil : le point où elles se croisent est la
 * date avant laquelle intervenir. Le rythme de la dérive, la valeur actuelle et l'organe sont dans le « ? ».
 * Une seule teinte mène, celle du ton de la dérive : la tendance prolongée et la date limite. Le relevé, la tendance
 * passée et le seuil restent en paliers de gris. L'axe porte des graduations rondes et le seuil dit sa valeur.
 *
 * « Planifier l'intervention » choisit le jour où intervenir : l'intervention rejoint « À faire » à sa date,
 * rattachée à la tâche du plan sur le même organe, et n'entre au journal qu'une fois faite.
 */
import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { ComposedChart, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { serieTendance, type Echeance, type Prevision, type Prevue } from '@/analytics/maintenance';
import { machineModel } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import type { History } from '@/sim/history';
import { useReducedMotion } from '@/store/ui';
import { InfoTip } from '@/ui/InfoTip';
import { TonGlyph } from '@/ui/explain';
import { fmtDay, fmtDayTime, fmtValue } from '@/ui/format';
import { uniteAxe } from '@/widgets/charts/axes';
import { fmtDateLongue, jourPrevu, joursJusqua, minuscule } from '../lib/carnet';
import { planifierDerive } from './actions';

const HEURE = 3_600_000;
/** Libellés des axes : en mono et en gris, la donnée garde la vedette. */
const TICK = { fontSize: 11, fill: 'var(--text-3)', fontFamily: 'var(--mono)' };
/** La tendance se dessine après l'apparition de la carte, le point de croisement après la tendance. */
const TRACE_DEBUT_MS = 450;
const TRACE_DUREE_MS = 1400;
/** Graduations et seuil sans zéro inutile : « 60 », « 72,5 ». */
const nombreRond = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const rond = (v: number) => nombreRond.format(v);

/** Pas rond (1, 2, 2,5 ou 5 fois une puissance de dix) pour environ `n` intervalles sur l'étendue. */
export function pasRond(etendue: number, n = 3): number {
  if (!(etendue > 0)) return 1;
  const brut = etendue / n;
  const p = 10 ** Math.floor(Math.log10(brut));
  const r = brut / p;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * p;
}

/** Échelle de l'axe arrondie au pas : les graduations tombent sur des valeurs rondes, bornes comprises. */
export function echelleRonde(lo: number, hi: number): { domaine: [number, number]; graduations: number[] } {
  const pas = pasRond(hi - lo);
  const bas = Math.floor(lo / pas) * pas;
  const haut = Math.ceil(hi / pas) * pas;
  const graduations: number[] = [];
  for (let v = bas; v <= haut + pas / 1000; v += pas) graduations.push(Math.round(v * 1000) / 1000);
  return { domaine: [bas, haut], graduations };
}

function dansCombien(t: number, now: number): string {
  const j = joursJusqua(t, now);
  return j <= 0 ? 'aujourd’hui' : j === 1 ? 'demain' : `dans ${j} jours`;
}

interface CarteProps {
  p: Prevision;
  h: History;
  machine: Machine;
  now: number;
  /** La tâche du plan sur le même organe, à laquelle l'intervention se rattache. */
  tache?: Echeance;
  /** L'intervention déjà planifiée pour cette dérive. */
  prevue?: Prevue;
}

function Carte({ p, h, machine, now, tache, prevue }: CarteProps) {
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
    return echelleRonde(lo - pad, hi + pad);
  }, [data, p.seuil]);

  const alarme = p.niveau === 'alarme';
  const ton = alarme ? 'crit' : 'warn';
  const couleur = alarme ? 'var(--crit)' : 'var(--warn)';
  const sens = p.pente < 0 ? 'en baisse' : 'en hausse';
  const libelle = minuscule(p.libelle);
  const nomSeuil = alarme ? 'seuil d’alarme' : 'seuil d’attention';


  return (
    <article className={`mt-prev ton-${ton}`}>
      <p className="mt-prev-phrase">
        <TonGlyph ton={ton} />
        <span>
          {p.libelle} de {machine.numero} {sens} : {nomSeuil} <b>{dansCombien(p.franchissement, now)}</b>
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
          <ComposedChart data={data} margin={{ top: 22, right: 20, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmtDay}
              tick={TICK}
              tickLine={false}
              axisLine={{ stroke: 'var(--grid)' }}
              minTickGap={40}
            />
            <YAxis
              domain={bornes.domaine}
              ticks={bornes.graduations}
              width={38}
              tickFormatter={rond}
              tick={TICK}
              tickLine={false}
              axisLine={false}
              label={p.unite ? uniteAxe(p.unite) : undefined}
            />
            <ReferenceLine
              y={p.seuil}
              stroke="var(--text-3)"
              strokeDasharray="4 3"
              ifOverflow="extendDomain"
              label={{ value: `seuil ${rond(p.seuil)}${p.unite ? ` ${p.unite}` : ''}`, position: p.pente < 0 ? 'insideBottomLeft' : 'insideTopLeft', ...TICK }}
            />
            <ReferenceLine
              x={now}
              stroke="var(--text-3)"
              strokeOpacity={0.6}
              label={{ value: 'aujourd’hui', position: 'insideTopLeft', ...TICK }}
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
            <Line dataKey="v" stroke="var(--text-2)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls={false} />
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
              <path d="M1 4h20" stroke="var(--text-2)" strokeWidth="2" />
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
              <path d="M1 4h20" stroke="var(--text-3)" strokeWidth="1.5" strokeDasharray="4 3" />
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
        <div className="mt-prev-action">
          {prevue && <span className="mt-prev-prevue">Prévue {jourPrevu(prevue.date, now)}</span>}
          <button
            type="button"
            className="btn sm"
            onClick={() => planifierDerive(p, tache, prevue)}
            aria-label={prevue ? `Déplacer l’intervention prévue sur ${machine.numero}` : `Planifier l’intervention sur ${machine.numero}`}
          >
            <CalendarClock aria-hidden /> {prevue ? 'Déplacer' : 'Planifier l’intervention'}
          </button>
        </div>
      </div>
    </article>
  );
}

interface Props {
  prev: Prevision[];
  h: History;
  byId: Map<string, Machine>;
  now: number;
  ech: Echeance[];
  prevues: Prevue[];
}

export function Previsions({ prev, h, byId, now, ech, prevues }: Props) {
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
        // Même rattachement que dans « À faire » : la première tâche du plan sur l'organe de la mesure.
        const tache = ech.find((e) => e.machineId === p.machineId && e.organeId === p.organeId);
        const prevue = prevues.find((x) => x.pointId === p.pointId || (tache && x.machineId === p.machineId && x.tacheId === tache.tacheId));
        return m ? <Carte key={p.pointId} p={p} h={h} machine={m} now={now} tache={tache} prevue={prevue} /> : null;
      })}
    </div>
  );
}
