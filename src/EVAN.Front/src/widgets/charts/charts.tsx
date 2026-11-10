/**
 * Graphiques Recharts du tableau de bord. Conventions : traits de 2 px, barres de 16 px aux extrémités
 * arrondies (4 px) côté donnée, grille fine, couleurs de série réservées aux marques
 * (le texte reste en encres de texte), infobulles où la valeur passe avant le libellé.
 * Les barres se remplissent une fois à leur arrivée (charts.css), sans rejouer au survol. Le survol ne fait rien
 * bouger : un fond derrière la ligne, l'infobulle posée sans glisser ; seule une machine choisie (clic) atténue les autres.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Seuils } from '@/domain/types';
import { graduationsRondes, uniteAxe } from './axes';
import './charts.css';

const nf = (v: number, d = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : d }).format(v);

const AXIS = { fontSize: 11, fill: 'var(--text-3)' };

/** Durée de l'arrivée des barres (charts.css) : le dernier segment empilé, décalage compris, plus une marge. */
const ARRIVEE_MS = 1300;

/**
 * Vrai le temps que les barres arrivent, puis faux pour de bon. Recharts recrée les rectangles à chaque nouveau rendu
 * (survol relié à la carte, données rafraîchies, fenêtre redimensionnée) : sans ce verrou, l'entrée de charts.css
 * rejouerait à chaque fois et le graphique se viderait sous la souris.
 */
function useArrivee(): boolean {
  const [arrivee, setArrivee] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setArrivee(false), ARRIVEE_MS);
    return () => clearTimeout(t);
  }, []);
  return arrivee;
}

/** Identifiant utilisable dans url(#…) : sans les deux-points ni les guillemets que React met dans useId. */
const idSvg = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

function TipBox({ title, rows, foot }: { title?: ReactNode; rows: { color?: string; value: ReactNode; label?: ReactNode }[]; foot?: ReactNode }) {
  return (
    <div className="chart-tip" style={{ position: 'static' }}>
      {title && <div className="faint">{title}</div>}
      {rows.map((r, i) => (
        <div key={i}>
          {r.color && <span className="k" style={{ background: r.color }} />}
          <b>{r.value}</b> {r.label && <span className="faint">{r.label}</span>}
        </div>
      ))}
      {foot}
    </div>
  );
}

export interface LinePoint {
  t: number;
  v: number;
}

/**
 * Courbe d'une mesure : plage normale en fond (gris calme : ce qui est normal ne prend pas de couleur, ISA-101),
 * seuils d'alarme libellés, alarmes repérées. `legende` ajoute au-dessus une légende courte (mesure, plage normale,
 * limite d'alarme, alarme levée) : des noms, pas des phrases ; ce qu'ils veulent dire va dans le « ? » de la carte.
 */
export function MeasureChart({
  data,
  seuils,
  unite,
  height = 250,
  markers = [],
  ticks,
  fmtX,
  fmtTip,
  legende = false,
}: {
  data: LinePoint[];
  seuils?: Seuils;
  unite?: string;
  height?: number;
  markers?: { t: number; label: string }[];
  ticks?: number[];
  fmtX(t: number): string;
  fmtTip(t: number): string;
  legende?: boolean;
}) {
  if (data.length < 2) return <div className="muted">Pas de données sur la période.</div>;
  let lo = Math.min(...data.map((d) => d.v));
  let hi = Math.max(...data.map((d) => d.v));
  const span = Math.max(1e-6, hi - lo);
  const show = (s?: number) => s !== undefined && s >= lo - span * 0.6 && s <= hi + span * 0.6;
  for (const s of [seuils?.alarmeBas, seuils?.alarmeHaut, seuils?.attentionBas, seuils?.attentionHaut]) {
    if (show(s)) {
      lo = Math.min(lo, s!);
      hi = Math.max(hi, s!);
    }
  }
  const pad = Math.max(1e-6, hi - lo) * 0.08;
  // Une mesure jamais négative (tension, température, vitesse) ne fait pas descendre l'axe sous zéro.
  const positive = lo >= 0;
  const domain: [number, number] = [positive ? Math.max(0, lo - pad) : lo - pad, hi + pad];
  const yTicks = graduationsRondes(domain[0], domain[1]);
  const plage = seuils?.attentionBas !== undefined || seuils?.attentionHaut !== undefined;
  const limites = [seuils?.alarmeHaut, seuils?.alarmeBas].filter(show);
  return (
    <div>
      {legende && (
        <div className="chart-legend" role="list">
          <span role="listitem">
            <i className="cl-trait" style={{ background: 'var(--series-1)' }} />
            <b>Mesure</b>
            {unite && <span className="faint"> ({unite})</span>}
          </span>
          {plage && (
            <span role="listitem">
              <i className="cl-plage" />
              <b>Plage normale</b>
            </span>
          )}
          {limites.length > 0 && (
            <span role="listitem">
              <i className="cl-trait" style={{ background: 'var(--crit)' }} />
              <b>Limite d’alarme</b>
            </span>
          )}
          {markers.length > 0 && (
            <span role="listitem">
              <i className="cl-carre" />
              <b>Alarme levée</b>
            </span>
          )}
        </div>
      )}
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: unite ? 22 : 14, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={fmtX} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={24} />
          <YAxis domain={domain} ticks={yTicks} tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => nf(v)} label={unite ? uniteAxe(unite) : undefined} />
          {plage && (
            <ReferenceArea y1={Math.max(domain[0], seuils?.attentionBas ?? domain[0])} y2={Math.min(domain[1], seuils?.attentionHaut ?? domain[1])} fill="var(--idle-soft)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
          )}
          {limites.map((s) => (
            <ReferenceLine
              key={`seuil-${s}`}
              y={s}
              stroke="var(--crit)"
              strokeWidth={1}
              label={{ value: `${legende ? 'Limite d’alarme' : 'Alarme'} ${nf(s!)} ${unite ?? ''}`, position: 'insideTopRight', fontSize: 11, fill: 'var(--text-3)' }}
            />
          ))}
          {markers.map((m, i) => (
            <ReferenceLine key={`m-${i}`} x={m.t} stroke="var(--crit)" strokeOpacity={0.45} label={{ value: '■', position: 'top', fill: 'var(--crit)', fontSize: 10 }} />
          ))}
          <Tooltip
            cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox title={fmtTip(Number(payload[0].payload.t))} rows={[{ color: 'var(--series-1)', value: `${nf(Number(payload[0].value), 2)} ${unite ?? ''}` }]} />
              ) : null
            }
          />
          <Line type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4.5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
    </div>
  );
}

export interface BarDatum {
  id: string;
  /** Libellé principal (numéro de machine, organe), en gras. */
  label: string;
  /** Seconde ligne discrète (nom, zone, type de machine). */
  sub?: string;
  values: number[];
  tip?: ReactNode;
}

/** Une série de barres : `motif: 'hachures'` la distingue autrement que par la couleur (un réglage hachuré à côté d'une panne pleine). */
export interface BarSeries {
  label: string;
  desc?: string;
  color: string;
  motif?: 'hachures';
}

/**
 * Barres horizontales, simples ou empilées. Chaque ligne porte son identifiant en gras et une seconde ligne
 * descriptive (ou seulement dans l'infobulle, `subsInTip`), lignes alternées pour suivre l'œil jusqu'à la barre,
 * valeur dans chaque segment assez large, total en bout de barre, légende explicite au-dessus.
 * `repere` trace un trait vertical de référence (une cible), nommé dans la légende.
 */
export function HBarChart({
  data,
  series,
  fmt,
  max,
  onClick,
  onHover,
  selectedId,
  highlightId,
  labelWidth = 160,
  subsInTip = false,
  repere,
}: {
  data: BarDatum[];
  series: BarSeries[];
  fmt(v: number): string;
  max?: number;
  onClick?(id: string): void;
  /** Survol d'une ligne (pour la relier à la carte). */
  onHover?(id: string | undefined): void;
  selectedId?: string;
  highlightId?: string;
  labelWidth?: number;
  /** Seconde ligne (nom, zone…) dans l'infobulle seulement : le numéro de machine suffit à lire le graphique. */
  subsInTip?: boolean;
  /** Trait vertical de référence, sur l'échelle des valeurs. */
  repere?: { valeur: number; label: ReactNode };
}) {
  const motifs = idSvg(useId());
  const arrivee = useArrivee();
  const remplissage = (s: BarSeries, i: number) => (s.motif === 'hachures' ? `url(#${motifs}-${i})` : s.color);
  const rows = data.map((d) => ({
    id: d.id,
    label: d.label,
    sub: d.sub,
    total: d.values.reduce((s, v) => s + v, 0),
    tip: d.tip,
    ...Object.fromEntries(d.values.map((v, i) => [`s${i}`, v])),
  }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const twoLines = !subsInTip && rows.some((r) => r.sub);
  const rowH = twoLines ? 40 : 30;
  const height = rows.length * rowH + 6;
  const maxChars = Math.floor((labelWidth - 14) / 6);
  const clip = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);
  const Tick = ({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
    const r = byId.get(String(payload?.value ?? ''));
    if (!r) return null;
    const on = r.id === selectedId || r.id === highlightId;
    return (
      <g style={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick ? () => onClick(r.id) : undefined}>
        <title>{r.sub ? `${r.label} · ${r.sub}` : r.label}</title>
        <text x={Number(x) - 10} y={Number(y)} dy={twoLines && r.sub ? -2 : 4} textAnchor="end" fontSize={12.5} fontWeight={700} fill={on ? 'var(--accent)' : 'var(--text)'}>
          {clip(r.label)}
        </text>
        {twoLines && r.sub && (
          <text x={Number(x) - 10} y={Number(y)} dy={12} textAnchor="end" fontSize={11} fill="var(--text-3)">
            {clip(r.sub)}
          </text>
        )}
      </g>
    );
  };
  // Valeur dans le segment, seulement s'il est assez large pour la porter.
  const Inside = (p: { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: unknown }) => {
    const w = Number(p.width);
    const v = Number(p.value);
    if (!v || w < 40) return null;
    return (
      <text className="hbar-dans" x={Number(p.x) + w / 2} y={Number(p.y) + Number(p.height) / 2} dy={4} textAnchor="middle" fontSize={10.5} fontWeight={700} pointerEvents="none">
        {fmt(v)}
      </text>
    );
  };
  return (
    <div className={arrivee ? 'hbar arrivee' : 'hbar'}>
      {(series.length > 1 || repere) && (
        <div className="chart-legend" role="list">
          {series.length > 1 &&
            series.map((s) => (
              <span key={s.label} role="listitem">
                <i className={s.motif === 'hachures' ? 'cl-hachures' : undefined} style={{ background: s.motif ? undefined : s.color, ['--c' as string]: s.color }} />
                <b>{s.label}</b>
                {s.desc && <span className="faint"> · {s.desc}</span>}
              </span>
            ))}
          {repere && (
            <span role="listitem">
              <i className="cl-repere" />
              <span>{repere.label}</span>
            </span>
          )}
        </div>
      )}
      <div className="chart" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            margin={{ top: 2, right: 58, bottom: 2, left: 0 }}
            barCategoryGap={twoLines ? 10 : 7}
            onMouseMove={onHover ? (st) => onHover(st.activeIndex != null ? rows[Number(st.activeIndex)]?.id : undefined) : undefined}
            onMouseLeave={onHover ? () => onHover(undefined) : undefined}
          >
            <defs>
              {series.map((s, i) =>
                s.motif === 'hachures' ? (
                  <pattern key={s.label} id={`${motifs}-${i}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                    <rect width={6} height={6} fill={s.color} />
                    <rect width={2} height={6} className="hbar-hachure" />
                  </pattern>
                ) : null,
              )}
            </defs>
            {/* Lignes alternées : l'œil suit la ligne du libellé à la barre. */}
            {rows.map((r, i) => (i % 2 === 0 ? <ReferenceArea key={r.id} y1={r.id} y2={r.id} fill="var(--surface-2)" fillOpacity={0.75} stroke="none" ifOverflow="visible" /> : null))}
            {/* Ligne survolée, ici ou sur la carte : un fond derrière elle, sans éteindre les autres barres. */}
            {highlightId && byId.has(highlightId) && <ReferenceArea y1={highlightId} y2={highlightId} fill="var(--accent-soft)" fillOpacity={1} stroke="none" ifOverflow="visible" />}
            <CartesianGrid horizontal={false} stroke="var(--grid)" />
            <XAxis type="number" hide domain={[0, max ?? 'dataMax']} />
            <YAxis type="category" dataKey="id" width={labelWidth} tick={<Tick />} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} interval={0} />
            {/* Survol relié à la carte : le fond de ligne ci-dessus remplace le curseur de Recharts. L'infobulle saute
                d'une ligne à l'autre au lieu de glisser. */}
            <Tooltip
              cursor={onHover ? false : { fill: 'var(--accent-soft)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, unknown> & { label: string; sub?: string; tip?: ReactNode; total: number };
                return (
                  <TipBox
                    title={row.sub ? `${row.label} · ${row.sub}` : row.label}
                    rows={[
                      ...series.map((s, i) => ({ color: s.color, value: fmt(Number(row[`s${i}`] ?? 0)), label: series.length > 1 ? s.label : undefined })),
                      ...(series.length > 1 ? [{ value: fmt(row.total), label: 'Total' }] : []),
                    ]}
                    foot={row.tip}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar
                key={s.label}
                name={s.label}
                dataKey={`s${i}`}
                stackId="a"
                className={`hbar-s${i}`}
                fill={remplissage(s, i)}
                stroke="var(--surface)"
                strokeWidth={1}
                barSize={twoLines ? 20 : 16}
                radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
                cursor={onClick ? 'pointer' : undefined}
                onClick={
                  onClick
                    ? (entry) => {
                        const id = (entry as { payload?: { id?: string } }).payload?.id;
                        if (id) onClick(id);
                      }
                    : undefined
                }
              >
                {rows.map((r) => (
                  <Cell key={r.id} fillOpacity={selectedId && r.id !== selectedId ? 0.35 : 1} />
                ))}
                {series.length > 1 && <LabelList dataKey={`s${i}`} content={Inside} />}
                {i === series.length - 1 && <LabelList dataKey="total" position="right" formatter={(v) => fmt(Number(v))} style={{ fontSize: 12, fontWeight: 700, fill: 'var(--text)' }} />}
              </Bar>
            ))}
            {repere && <ReferenceLine x={repere.valeur} stroke="var(--text-2)" strokeDasharray="4 3" strokeWidth={1.5} ifOverflow="extendDomain" />}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Colonnes par jour (une série), valeur sur le chapeau. */
export function DayColumns({ data, label, color = 'var(--series-1)', fmtDay }: { data: { t: number; v: number }[]; label: string; color?: string; fmtDay(t: number): string }) {
  const arrivee = useArrivee();
  return (
    <div className={arrivee ? 'chart chart-colonnes arrivee' : 'chart chart-colonnes'} style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="t" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={30} label={uniteAxe(label)} />
          <Tooltip
            cursor={{ fill: 'var(--accent-soft)' }}
            content={({ active, payload }) => (active && payload?.length ? <TipBox title={fmtDay(Number(payload[0].payload.t))} rows={[{ color, value: String(payload[0].value), label }]} /> : null)}
          />
          <Bar dataKey="v" fill={color} barSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="v" position="top" style={{ fontSize: 11.5, fontWeight: 650, fill: 'var(--text)' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CleTrs = 'trs' | 'D' | 'P' | 'Q';

/**
 * TRS et ses trois composantes, jour par jour (une seule échelle : pourcentage). `libelles` renomme les séries
 * en mots de tous les jours ; `reference` trace une ligne horizontale de repère (en %).
 */
export function TrsTrend({
  data,
  fmtDay,
  libelles,
  reference,
  height = 250,
}: {
  data: { t: number; trs: number; D: number; P: number; Q: number }[];
  fmtDay(t: number): string;
  libelles?: Partial<Record<CleTrs, string>>;
  reference?: { valeur: number; label: string };
  height?: number;
}) {
  const series = [
    { key: 'trs', label: libelles?.trs ?? 'TRS', color: 'var(--series-1)', width: 2.5 },
    { key: 'D', label: libelles?.D ?? 'Disponibilité', color: 'var(--series-2)', width: 2 },
    { key: 'P', label: libelles?.P ?? 'Performance', color: 'var(--series-3)', width: 2 },
    { key: 'Q', label: libelles?.Q ?? 'Qualité', color: 'var(--series-4)', width: 2 },
  ];
  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: reference ? 76 : 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="t" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
          <YAxis domain={[(min: number) => Math.max(0, Math.floor((min - 8) / 10) * 10), 100]} tick={AXIS} tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => `${v}\u00a0%`} />
          {/* Légende dans l'ordre des séries (le TRS d'abord), pas dans l'ordre alphabétique. */}
          <Legend verticalAlign="top" align="left" iconType="plainline" itemSorter={(item) => series.findIndex((x) => x.key === item.dataKey)} wrapperStyle={{ fontSize: 12, color: 'var(--text-2)', paddingBottom: 8 }} />
          {reference && (
            <ReferenceLine
              y={reference.valeur}
              stroke="var(--text-2)"
              strokeDasharray="4 3"
              ifOverflow="extendDomain"
              label={{ value: reference.label, position: 'right', fontSize: 11, fill: 'var(--text-2)' }}
            />
          )}
          <Tooltip
            cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox
                  title={fmtDay(Number(payload[0].payload.t))}
                  rows={series.map((s) => ({ color: s.color, value: `${nf(Number(payload[0].payload[s.key]), 0)} %`, label: s.label }))}
                />
              ) : null
            }
          />
          {series.map((s) => (
            <Line
              key={s.key}
              name={s.label}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={s.width}
              dot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--surface)', fill: s.color }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Colonnes empilées par jour (plusieurs séries, une seule échelle) : 2 px de surface entre les segments, coins arrondis
 * au sommet, total sur le chapeau, légende explicite au-dessus.
 */
export function StackedDayColumns({
  data,
  series,
  fmt,
  fmtTotal = fmt,
  fmtDay,
  unite,
  height = 250,
}: {
  data: { t: number; values: number[] }[];
  series: { label: string; color: string }[];
  fmt(v: number): string;
  /** Unité des graduations, écrite au-dessus de l'axe vertical. */
  unite?: string;
  /** Total écrit sur le chapeau de la colonne (plus court que dans l'infobulle). */
  fmtTotal?(v: number): string;
  fmtDay(t: number): string;
  height?: number;
}) {
  const arrivee = useArrivee();
  const rows = data.map((d) => ({ t: d.t, total: d.values.reduce((s, v) => s + v, 0), ...Object.fromEntries(d.values.map((v, i) => [`s${i}`, v])) }));
  return (
    <div>
      <div className="chart-legend" role="list">
        {series.map((s) => (
          <span key={s.label} role="listitem">
            <i style={{ background: s.color }} />
            <b>{s.label}</b>
          </span>
        ))}
      </div>
      <div className={arrivee ? 'chart chart-colonnes arrivee' : 'chart chart-colonnes'} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="t" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => nf(v, 0)} label={unite ? uniteAxe(unite) : undefined} />
            <Tooltip
              cursor={{ fill: 'var(--accent-soft)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, number>;
                return (
                  <TipBox
                    title={fmtDay(row.t)}
                    rows={[...series.map((s, i) => ({ color: s.color, value: fmt(row[`s${i}`] ?? 0), label: s.label })), { value: fmt(row.total), label: 'Total' }]}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar key={s.label} dataKey={`s${i}`} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={2} barSize={26} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
            {/* Total au-dessus de la pile, même si le dernier segment est vide : une ligne invisible porte l'étiquette. */}
            <Line dataKey="total" stroke="none" dot={false} activeDot={false} isAnimationActive={false} legendType="none">
              <LabelList dataKey="total" position="top" formatter={(v) => fmtTotal(Number(v))} style={{ fontSize: 11.5, fontWeight: 650, fill: 'var(--text)' }} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
