/**
 * Graphiques Recharts des écrans d'analyse. Conventions : la première série à l'encre du texte (elle mène), les autres
 * en paliers de neutre ; une couleur d'état seulement quand la série est un état (panne, réglage, veille, production),
 * et alors en teinte posée, mêlée à la surface, pour que les grandes marques ne crient pas. Traits de 2 px, barres
 * fines aux extrémités arrondies côté donnée, grille au filet, graduations et valeurs en mono 11 px à l'encre la plus
 * discrète (le texte ne prend jamais la couleur d'une série), infobulles où la valeur passe avant le libellé.
 * Les barres se remplissent une fois à leur arrivée (charts.css), sans rejouer au survol. Le survol ne fait rien
 * bouger : un fond derrière la ligne, l'infobulle posée sans glisser ; seule une machine choisie (clic) atténue les autres.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { EtatMachine, Seuils } from '@/domain/types';
import { StatusIcon } from '@/ui/status';
import { graduationsRondes, uniteAxe } from './axes';
import './charts.css';

const nf = (v: number, d = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : d }).format(v);

/** Graduations : la règle CSS de graphiques.css (mono 11 px, --text-3) passe devant ces attributs, gardés en repli. */
const AXIS = { fontSize: 11, fill: 'var(--text-3)' };

/** Durée de l'arrivée des barres (charts.css) : le dernier segment empilé, décalage compris, plus une marge. */
const ARRIVEE_MS = 900;

/** Couleur d'une marque : la teinte de la série mêlée à la surface de la carte (--ton-pose, styles/graphiques.css),
 *  ce qui calme les états vifs sans les changer. */
const posee = (couleur: string) => `color-mix(in srgb, ${couleur} var(--ton-pose), var(--surface))`;

/** Une série dont la couleur est celle d'un état machine se légende par la forme de cet état (carré, losange…). */
const ETAT_DE_COULEUR: Record<string, EtatMachine> = {
  'var(--crit)': 'panne',
  'var(--setup)': 'calage',
  'var(--ok)': 'marche',
  'var(--idle)': 'arret',
  'var(--warn)': 'attention',
};

/** Écart minimal entre deux dates de l'axe. Recharts mesure les graduations dans la police du texte, pas dans la mono
 *  qui les dessine (plus large d'un cinquième) : l'écart rattrape la différence pour que deux dates ne se touchent pas. */
const ECART_DATES = 20;

/** Chasse d'un caractère de la mono à 11 px (0,6 em), pour mesurer une valeur sans la rendre. */
const CHASSE_MONO = 6.6;

/** Calque juste sous celui des barres de Recharts (300) : un trait de repère n'y barre pas les valeurs écrites. */
const CALQUE_SOUS_BARRES = 290;

/** Hauteur de l'axe horizontal de Recharts (valeur par défaut), pour placer les étiquettes de fin de courbe. */
const HAUTEUR_AXE_X = 30;

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

/** Largeur d'un bloc, suivie au redimensionnement : un graphique étroit renonce à ce qui ne tient pas. */
function useLargeur() {
  const ref = useRef<HTMLDivElement>(null);
  const [largeur, setLargeur] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargeur(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setLargeur(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largeur] as const;
}

/** Identifiant utilisable dans url(#…) : sans les deux-points ni les guillemets que React met dans useId. */
const idSvg = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '');

/** Pastille de légende : la forme de l'état pour une série d'état, sinon un carré (ou des hachures) de sa couleur. */
function Pastille({ couleur, motif }: { couleur: string; motif?: 'hachures' }) {
  const etat = ETAT_DE_COULEUR[couleur];
  if (etat && !motif) return <StatusIcon etat={etat} size={10} animate={false} />;
  return <i className={motif === 'hachures' ? 'cl-hachures' : undefined} style={{ background: motif ? undefined : posee(couleur), ['--c' as string]: couleur }} />;
}

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

/** Ce que Recharts passe au contenu d'une étiquette de barre. */
interface PropsEtiquette {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  height?: number | string;
  value?: unknown;
}

export interface LinePoint {
  t: number;
  v: number;
}

/**
 * Courbe d'une mesure : plage normale en fond (voile neutre : ce qui est normal ne prend pas de couleur, ISA-101),
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
  nom,
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
  /** Nom du graphique, dit aux lecteurs d'écran (les flèches parcourent les relevés). */
  nom?: string;
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
          <ComposedChart data={data} margin={{ top: unite ? 22 : 14, right: 12, bottom: 0, left: 0 }} aria-label={nom}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} ticks={ticks} tickFormatter={fmtX} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={Math.max(24, ECART_DATES)} />
            <YAxis domain={domain} ticks={yTicks} tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => nf(v)} label={unite ? uniteAxe(unite) : undefined} />
            {plage && (
              <ReferenceArea y1={Math.max(domain[0], seuils?.attentionBas ?? domain[0])} y2={Math.min(domain[1], seuils?.attentionHaut ?? domain[1])} fill="var(--bande)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
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
            <Line type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export interface BarDatum {
  id: string;
  /** Libellé principal (numéro de machine, organe). */
  label: string;
  /** Seconde ligne discrète (nom, zone, type de machine). */
  sub?: string;
  values: number[];
  tip?: ReactNode;
}

/** Une série de barres : `motif: 'hachures'` la distingue autrement que par la couleur, pour qui en a besoin (impression). */
export interface BarSeries {
  label: string;
  desc?: string;
  color: string;
  motif?: 'hachures';
}

/**
 * Barres horizontales, simples ou empilées : une liste classée à barres fines. Chaque ligne porte son libellé (et une
 * seconde ligne descriptive, ou seulement dans l'infobulle avec `subsInTip`), la valeur s'écrit au bout de la barre et
 * nulle part ailleurs, la légende nomme les séries au-dessus. Pas de grille : chaque barre dit déjà sa valeur.
 * `repere` trace un trait vertical de référence (une cible), nommé dans la légende.
 *
 * Accessibilité : le graphique n'est pas une « application » sans nom. Quand une ligne se choisit (`onClick`), chaque
 * libellé est un bouton : une seule tabulation entre dans le graphique, les flèches haut et bas passent d'une ligne à
 * l'autre, Entrée ou Espace choisit. Sinon, une liste invisible à l'écran dit chaque ligne et ses valeurs.
 *
 * Au toucher, un premier appui sur une ligne montre sa bulle (qui dit ce que fera le choix), un second la choisit : un
 * doigt qui voulait lire une valeur ne filtre pas tout l'écran sans le voir.
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
  nom,
  nommerClic,
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
  /** Nom du graphique, dit aux lecteurs d'écran. */
  nom?: string;
  /** Ce que fera le choix d'une ligne, dit dans sa bulle : « ne voir que R02 ». `choisie` : la ligne l'est déjà. */
  nommerClic?(label: string, choisie: boolean): string;
}) {
  const motifs = idSvg(useId());
  const arrivee = useArrivee();
  const boite = useRef<HTMLDivElement>(null);
  /** Dernier appui au doigt : le premier toucher d'une ligne l'arme (bulle), le second la choisit. */
  const auDoigt = useRef(false);
  const [armee, setArmee] = useState<string>();
  /** Ligne qui porte la tabulation (une seule entre dans le graphique) et ligne qui a le focus clavier. */
  const [courante, setCourante] = useState<string>();
  const [focusId, setFocusId] = useState<string>();
  const empilees = series.length > 1;
  const remplissage = (s: BarSeries, i: number) => (s.motif === 'hachures' ? `url(#${motifs}-${i})` : posee(s.color));
  const rows = data.map((d) => ({
    id: d.id,
    label: d.label,
    sub: d.sub,
    total: d.values.reduce((s, v) => s + v, 0),
    values: d.values,
    tip: d.tip,
    ...Object.fromEntries(d.values.map((v, i) => [`s${i}`, v])),
  }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const twoLines = !subsInTip && rows.some((r) => r.sub);
  const rowH = twoLines ? 40 : 28;
  const height = rows.length * rowH + 8;
  const maxChars = Math.floor((labelWidth - 14) / 6.4);
  // La marge de droite porte la valeur la plus longue (« 6 062 kWh ») : elle ne déborde jamais de la carte.
  const margeDroite = Math.ceil(Math.max(4, ...rows.map((r) => fmt(r.total).length)) * CHASSE_MONO) + 16;
  const clip = (s: string) => (s.length > maxChars ? `${s.slice(0, maxChars - 1)}…` : s);
  const tabulable = byId.has(courante ?? '') ? courante : byId.has(selectedId ?? '') ? selectedId : rows[0]?.id;
  const enMots = (r: (typeof rows)[number]) =>
    [
      r.sub ? `${r.label}, ${r.sub}` : r.label,
      ...(empilees ? series.map((s, i) => `${s.label} ${fmt(r.values[i] ?? 0)}`) : [fmt(r.total)]),
      ...(empilees ? [`total ${fmt(r.total)}`] : []),
    ].join(', ');

  const choisir = (id: string) => {
    if (!onClick) return;
    if (auDoigt.current && armee !== id) {
      setArmee(id);
      onHover?.(id);
      return;
    }
    setArmee(undefined);
    onClick(id);
  };
  const allerA = (id: string) => {
    setCourante(id);
    requestAnimationFrame(() => boite.current?.querySelector<SVGGElement>(`[data-ligne="${CSS.escape(id)}"]`)?.focus());
  };
  const auClavier = (e: KeyboardEvent<SVGGElement>, id: string) => {
    const i = rows.findIndex((r) => r.id === id);
    const cible = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: rows.length - 1 }[e.key];
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setArmee(undefined);
      onClick?.(id);
      return;
    }
    if (cible === undefined) return;
    e.preventDefault();
    allerA(rows[Math.max(0, Math.min(rows.length - 1, cible))].id);
  };

  // Rendue par une fonction (et non un composant déclaré ici) : Recharts garde le même élément d'un rendu à l'autre,
  // et le libellé qui a le focus clavier ne le perd pas quand le survol redessine le graphique.
  const tick = ({ x, y, payload }: { x?: number | string; y?: number | string; payload?: { value?: string } }) => {
    const r = byId.get(String(payload?.value ?? ''));
    if (!r) return <g />;
    const on = r.id === selectedId || r.id === highlightId || r.id === focusId;
    const bouton = onClick
      ? {
          role: 'button',
          tabIndex: r.id === tabulable ? 0 : -1,
          'aria-pressed': r.id === selectedId,
          'aria-label': enMots(r),
          'data-ligne': r.id,
          onKeyDown: (e: KeyboardEvent<SVGGElement>) => auClavier(e, r.id),
          onFocus: () => {
            setCourante(r.id);
            setFocusId(r.id);
            onHover?.(r.id);
          },
          onBlur: () => {
            setFocusId(undefined);
            onHover?.(undefined);
          },
        }
      : {};
    return (
      <g style={{ cursor: onClick ? 'pointer' : undefined }} onClick={onClick ? () => choisir(r.id) : undefined} className="hbar-ligne" {...bouton}>
        <title>{r.sub ? `${r.label} · ${r.sub}` : r.label}</title>
        {r.id === focusId && (
          <rect className="hbar-focus" x={Number(x) - labelWidth + 4} y={Number(y) - rowH / 2 + 2} width={labelWidth - 8} height={rowH - 4} rx={4} />
        )}
        <text x={Number(x) - 12} y={Number(y)} dy={twoLines && r.sub ? -2 : 4} textAnchor="end" fontSize={12} fontWeight={500} fill={on ? 'var(--text)' : 'var(--text-2)'}>
          {clip(r.label)}
        </text>
        {twoLines && r.sub && (
          <text x={Number(x) - 12} y={Number(y)} dy={12} textAnchor="end" fontSize={11} fill="var(--text-3)">
            {clip(r.sub)}
          </text>
        )}
      </g>
    );
  };
  // Le total au bout de la barre : la seule valeur écrite, en mono discret. Quand un trait de repère peut la traverser,
  // un fond de la couleur de la carte passe sous elle (la largeur se déduit de la chasse fixe de la mono).
  const Fin = (p: PropsEtiquette) => {
    const v = Number(p.value);
    if (!Number.isFinite(v)) return null;
    const texte = fmt(v);
    const x = Number(p.x) + Number(p.width) + 8;
    const y = Number(p.y) + Number(p.height) / 2;
    return (
      <g pointerEvents="none">
        {repere && <rect x={x - 4} y={y - 8} width={texte.length * CHASSE_MONO + 8} height={16} fill="var(--surface)" />}
        <text className="ch-valeur" x={x} y={y} dy={4}>
          {texte}
        </text>
      </g>
    );
  };
  // Ce que fera le choix de la ligne, au bas de sa bulle. Au doigt, la ligne vient d'être armée : « Touchez encore ».
  const indice = (r: { id: string; label: string }) =>
    onClick && nommerClic ? <div className="faint ch-indice">{`${auDoigt.current ? 'Touchez encore' : 'Cliquez'} pour ${nommerClic(r.label, r.id === selectedId)}`}</div> : null;
  return (
    <div
      ref={boite}
      className={arrivee ? 'hbar arrivee' : 'hbar'}
      role={onClick ? 'group' : undefined}
      aria-label={onClick ? nom : undefined}
      onPointerDown={(e) => {
        auDoigt.current = e.pointerType === 'touch';
      }}
    >
      {(empilees || repere) && (
        <div className="chart-legend" role="list">
          {empilees &&
            series.map((s) => (
              <span key={s.label} role="listitem">
                <Pastille couleur={s.color} motif={s.motif} />
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
      {!onClick && (
        <ul className="sr-only" aria-label={nom}>
          {rows.map((r) => (
            <li key={r.id}>{enMots(r)}</li>
          ))}
        </ul>
      )}
      <div className="chart" style={{ height }} aria-hidden={onClick ? undefined : true}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            layout="vertical"
            accessibilityLayer={false}
            margin={{ top: 4, right: margeDroite, bottom: 4, left: 0 }}
            barCategoryGap={twoLines ? 12 : 8}
            onMouseMove={onHover ? (st) => onHover(st.activeIndex != null ? rows[Number(st.activeIndex)]?.id : undefined) : undefined}
            onMouseLeave={onHover ? () => onHover(undefined) : undefined}
          >
            <defs>
              {series.map((s, i) =>
                s.motif === 'hachures' ? (
                  <pattern key={s.label} id={`${motifs}-${i}`} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                    <rect width={6} height={6} fill={posee(s.color)} />
                    <rect width={2} height={6} className="hbar-hachure" />
                  </pattern>
                ) : null,
              )}
            </defs>
            {/* Ligne survolée, ici ou sur la carte : un fond derrière elle, sans éteindre les autres barres. */}
            {highlightId && byId.has(highlightId) && <ReferenceArea y1={highlightId} y2={highlightId} fill="var(--accent-soft)" fillOpacity={1} stroke="none" ifOverflow="visible" />}
            <XAxis type="number" hide domain={[0, max ?? 'dataMax']} />
            <YAxis type="category" dataKey="id" width={labelWidth} tick={tick} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} interval={0} />
            {/* Survol relié à la carte : le fond de ligne ci-dessus remplace le curseur de Recharts. L'infobulle saute
                d'une ligne à l'autre au lieu de glisser. */}
            <Tooltip
              cursor={onHover ? false : { fill: 'var(--accent-soft)' }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, unknown> & { id: string; label: string; sub?: string; tip?: ReactNode; total: number };
                return (
                  <TipBox
                    title={row.sub ? `${row.label} · ${row.sub}` : row.label}
                    rows={[
                      ...series.map((s, i) => ({ color: s.color, value: fmt(Number(row[`s${i}`] ?? 0)), label: empilees ? s.label : undefined })),
                      ...(empilees ? [{ value: fmt(row.total), label: 'Total' }] : []),
                    ]}
                    foot={
                      <>
                        {row.tip}
                        {indice(row)}
                      </>
                    }
                  />
                );
              }}
            />
            {/* Le trait de repère passe sous le calque des barres (300 chez Recharts), qui porte aussi les valeurs écrites au
                bout : il ne les barre pas, leur fond de carte le masque. */}
            {repere && <ReferenceLine x={repere.valeur} stroke="var(--text-2)" strokeWidth={1} ifOverflow="extendDomain" zIndex={CALQUE_SOUS_BARRES} />}
            {series.map((s, i) => (
              <Bar
                key={s.label}
                name={s.label}
                dataKey={`s${i}`}
                stackId="a"
                className={`hbar-s${i}`}
                fill={remplissage(s, i)}
                // Deux pixels de surface entre deux segments empilés : la séparation vient du vide, pas d'un trait.
                stroke={empilees ? 'var(--surface)' : 'none'}
                strokeWidth={empilees ? 2 : 0}
                barSize={twoLines ? 14 : 12}
                radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
                isAnimationActive={false}
                cursor={onClick ? 'pointer' : undefined}
                onClick={
                  onClick
                    ? (entry) => {
                        const id = (entry as { payload?: { id?: string } }).payload?.id;
                        if (id) choisir(id);
                      }
                    : undefined
                }
              >
                {rows.map((r) => (
                  <Cell key={r.id} fillOpacity={selectedId && r.id !== selectedId ? 0.35 : 1} />
                ))}
                {i === series.length - 1 && <LabelList dataKey="total" content={Fin} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Valeur écrite sur le chapeau d'une colonne, en mono discret. */
function Chapeau({ fmt = String, ...p }: PropsEtiquette & { fmt?: (v: number) => string }) {
  const v = Number(p.value);
  if (!Number.isFinite(v)) return null;
  return (
    <text className="ch-valeur" x={Number(p.x) + Number(p.width) / 2} y={Number(p.y)} dy={-8} textAnchor="middle" pointerEvents="none">
      {fmt(v)}
    </text>
  );
}

/**
 * Colonnes par jour (une série), valeur sur le chapeau. `fmtDay` écrit l'axe, `fmtTip` le titre de la bulle quand il
 * doit en dire plus (« de 16:00 à 20:00 » pour une tranche de 4 heures).
 */
export function DayColumns({
  data,
  label,
  color = 'var(--series-1)',
  fmtDay,
  fmtTip = fmtDay,
  nom,
}: {
  data: { t: number; v: number }[];
  label: string;
  color?: string;
  fmtDay(t: number): string;
  fmtTip?(t: number): string;
  /** Nom du graphique, dit aux lecteurs d'écran (les flèches parcourent les colonnes). */
  nom?: string;
}) {
  const arrivee = useArrivee();
  return (
    <div className={arrivee ? 'chart chart-colonnes arrivee' : 'chart chart-colonnes'} style={{ height: 230 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} aria-label={nom}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="t" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={ECART_DATES} />
          <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={30} label={uniteAxe(label)} />
          <Tooltip
            cursor={{ fill: 'var(--accent-soft)' }}
            content={({ active, payload }) => (active && payload?.length ? <TipBox title={fmtTip(Number(payload[0].payload.t))} rows={[{ color, value: String(payload[0].value), label }]} /> : null)}
          />
          <Bar dataKey="v" fill={posee(color)} barSize={16} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            <LabelList dataKey="v" content={(p) => <Chapeau {...(p as PropsEtiquette)} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type CleTrs = 'trs' | 'D' | 'P' | 'Q';

/** L'efficacité mène à l'encre du texte ; ses trois composantes suivent en paliers de neutre, du plus présent au plus discret. */
const SERIES_TRS: { key: CleTrs; defaut: string; color: string; width: number }[] = [
  { key: 'trs', defaut: 'TRS', color: 'var(--series-1)', width: 2 },
  { key: 'D', defaut: 'Disponibilité', color: 'var(--serie-neutre-1)', width: 1.5 },
  { key: 'P', defaut: 'Performance', color: 'var(--serie-neutre-2)', width: 1.5 },
  { key: 'Q', defaut: 'Qualité', color: 'var(--serie-neutre-3)', width: 1.5 },
];
const MARGE_HAUT_TRS = 8;
/** Écart minimal entre deux étiquettes de fin de courbe, en pixels : une ligne de texte de 11 px et son souffle. */
const ECART_ETIQUETTES = 15;
/** En dessous de cette largeur, les noms au bout des courbes mangeraient le graphique : la légende suffit. */
const LARGEUR_ETIQUETTES = 480;

/** Hauteurs des étiquettes de fin, écartées juste assez pour ne pas se chevaucher, sans sortir du graphique. */
function ecarter(ys: number[], haut: number, bas: number): number[] {
  const ordre = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < ordre.length; k++) ordre[k].y = Math.max(ordre[k].y, ordre[k - 1].y + ECART_ETIQUETTES);
  const debord = ordre.length ? ordre[ordre.length - 1].y - bas : 0;
  if (debord > 0) for (const o of ordre) o.y -= debord;
  for (let k = ordre.length - 2; k >= 0; k--) ordre[k].y = Math.min(ordre[k].y, ordre[k + 1].y - ECART_ETIQUETTES);
  const out: number[] = [];
  for (const o of ordre) out[o.i] = Math.max(haut, o.y);
  return out;
}

type JourEfficacite = { t: number; trs: number; D: number; P: number; Q: number };
/** Un jour sans relevé (atelier fermé) : il garde sa place sur l'axe, ses valeurs vides interrompent les courbes. */
type JourFerme = { t: number; ferme: true; trs: null; D: null; P: null; Q: null };

/**
 * Les jours fermés (le dimanche) remis à leur place entre deux jours ouverts : l'axe ne saute pas de samedi à lundi,
 * et la courbe s'interrompt ce jour-là au lieu de relier deux jours comme s'ils se suivaient.
 */
export function avecJoursFermes(data: JourEfficacite[]): (JourEfficacite | JourFerme)[] {
  const out: (JourEfficacite | JourFerme)[] = [];
  data.forEach((j, i) => {
    if (i > 0) {
      const d = new Date(data[i - 1].t);
      d.setDate(d.getDate() + 1);
      // Une heure de marge : un changement d'heure décale minuit d'autant.
      for (; d.getTime() < j.t - 3_600_000; d.setDate(d.getDate() + 1)) out.push({ t: d.getTime(), ferme: true, trs: null, D: null, P: null, Q: null });
    }
    out.push(j);
  });
  return out;
}

/**
 * TRS et ses trois composantes, jour par jour (une seule échelle : pourcentage). `libelles` renomme les séries
 * en mots de tous les jours ; `reference` trace une ligne horizontale de repère (en %). Chaque courbe est nommée à son
 * extrémité droite, à côté de la légende : on n'a pas à retrouver une nuance de gris pour savoir qui est qui.
 */
export function TrsTrend({
  data,
  fmtDay,
  libelles,
  reference,
  height = 250,
  nom,
}: {
  data: JourEfficacite[];
  fmtDay(t: number): string;
  libelles?: Partial<Record<CleTrs, string>>;
  reference?: { valeur: number; label: string };
  height?: number;
  /** Nom du graphique, dit aux lecteurs d'écran (les flèches parcourent les jours). */
  nom?: string;
}) {
  const jours = useMemo(() => avecJoursFermes(data), [data]);
  const [boite, largeur] = useLargeur();
  const series = SERIES_TRS.map((s) => ({ ...s, label: libelles?.[s.key] ?? s.defaut }));
  const valeurs = data.flatMap((d) => [d.trs, d.D, d.P, d.Q]).filter((v) => Number.isFinite(v));
  const mini = Math.min(...valeurs, reference?.valeur ?? 100);
  const lo = Math.max(0, Math.floor((mini - 8) / 10) * 10);

  // Étiquettes de fin : les noms des courbes (et du repère) en colonne à droite, à la hauteur de leur dernier point.
  const dernier = data[data.length - 1];
  const fins = largeur >= LARGEUR_ETIQUETTES && dernier;
  const textes = fins
    ? [
        ...series.map((s) => ({ cle: s.key as string, texte: s.label, valeur: dernier[s.key], color: s.color, mene: s.key === 'trs' })),
        ...(reference ? [{ cle: 'reference', texte: reference.label, valeur: reference.valeur, color: 'var(--text-3)', mene: false }] : []),
        // Une série sans dernière valeur (trou) n'a pas d'étiquette : un NaN fausserait la place de toutes les autres.
      ].filter((t) => Number.isFinite(t.valeur))
    : [];
  const margeDroite = fins ? Math.ceil(Math.max(...textes.map((t) => t.texte.length)) * 6.2) + 28 : 16;
  const hautPlot = height - MARGE_HAUT_TRS - HAUTEUR_AXE_X;
  const yDe = (v: number) => MARGE_HAUT_TRS + ((100 - v) / (100 - lo)) * hautPlot;
  const ys = ecarter(
    textes.map((t) => yDe(t.valeur)),
    MARGE_HAUT_TRS,
    MARGE_HAUT_TRS + hautPlot,
  );

  return (
    <div>
      <div className="chart-legend" role="list">
        {series.map((s) => (
          <span key={s.key} role="listitem">
            <i className="cl-trait" style={{ background: s.color }} />
            <b>{s.label}</b>
          </span>
        ))}
      </div>
      <div className="chart" ref={boite} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={jours} margin={{ top: MARGE_HAUT_TRS, right: margeDroite, bottom: 0, left: 0 }} aria-label={nom}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="t" tickFormatter={fmtDay} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={ECART_DATES} />
            <YAxis domain={[lo, 100]} ticks={graduationsRondes(lo, 100)} tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${v} %`} />
            {reference && (
              <ReferenceLine
                y={reference.valeur}
                stroke="var(--text-3)"
                strokeWidth={1}
                ifOverflow="extendDomain"
                label={fins ? undefined : { value: reference.label, position: 'insideTopRight', fontSize: 11, fill: 'var(--text-3)' }}
              />
            )}
            <Tooltip
              cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
              // Un jour fermé n'a que des valeurs vides : sans ce réglage, Recharts n'ouvrirait pas sa bulle.
              filterNull={false}
              content={({ active, payload, label }) => {
                if (!active) return null;
                const jour = jours.find((j) => j.t === Number(label));
                if (jour && 'ferme' in jour) return <TipBox title={fmtDay(jour.t)} rows={[{ value: 'Atelier fermé', label: 'pas d’efficacité ce jour-là' }]} />;
                if (!payload?.length) return null;
                return (
                  <TipBox
                    title={fmtDay(Number(payload[0].payload.t))}
                    rows={series.map((s) => ({ color: s.color, value: `${nf(Number(payload[0].payload[s.key]), 0)} %`, label: s.label }))}
                  />
                );
              }}
            />
            {/* Les composantes d'abord, l'efficacité par-dessus : la courbe qui mène n'est jamais recouverte. */}
            {[...series].reverse().map((s) => (
              <Line
                key={s.key}
                name={s.label}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={s.width}
                dot={s.key === 'trs' ? { r: 3.5, strokeWidth: 2, stroke: 'var(--surface)', fill: s.color } : false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: s.color }}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {fins && (
          <div className="ch-fins" aria-hidden style={{ width: margeDroite - 8 }}>
            {textes.map((t, i) => (
              <span key={t.cle} className={t.mene ? 'mene' : undefined} style={{ top: ys[i] }}>
                <i style={{ background: t.color }} />
                {t.texte}
              </span>
            ))}
          </div>
        )}
      </div>
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
  enCours,
  nom,
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
  /**
   * Début du jour qui n'est pas fini (aujourd'hui) : sa colonne est plus pâle et l'axe dit « en cours ». Sans cela, un
   * jour à moitié écoulé ressemble à un jour faible.
   */
  enCours?: number;
  /** Nom du graphique, dit aux lecteurs d'écran (les flèches parcourent les jours). */
  nom?: string;
}) {
  const arrivee = useArrivee();
  const rows = data.map((d) => ({ t: d.t, total: d.values.reduce((s, v) => s + v, 0), ...Object.fromEntries(d.values.map((v, i) => [`s${i}`, v])) }));
  const jour = (t: number) => (t === enCours ? 'en cours' : fmtDay(t));
  return (
    <div>
      <div className="chart-legend" role="list">
        {series.map((s) => (
          <span key={s.label} role="listitem">
            <Pastille couleur={s.color} />
            <b>{s.label}</b>
          </span>
        ))}
      </div>
      <div className={arrivee ? 'chart chart-colonnes arrivee' : 'chart chart-colonnes'} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} aria-label={nom}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="t" tickFormatter={jour} tick={AXIS} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={ECART_DATES} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => nf(v, 0)} label={unite ? uniteAxe(unite) : undefined} />
            <Tooltip
              cursor={{ fill: 'var(--accent-soft)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0].payload as Record<string, number>;
                return (
                  <TipBox
                    title={row.t === enCours ? `${fmtDay(row.t)}, en cours` : fmtDay(row.t)}
                    rows={[...series.map((s, i) => ({ color: s.color, value: fmt(row[`s${i}`] ?? 0), label: s.label })), { value: fmt(row.total), label: row.t === enCours ? 'Total jusqu’ici' : 'Total' }]}
                  />
                );
              }}
            />
            {series.map((s, i) => (
              <Bar key={s.label} dataKey={`s${i}`} stackId="a" fill={posee(s.color)} stroke="var(--surface)" strokeWidth={2} barSize={20} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.t} fillOpacity={r.t === enCours ? 0.45 : 1} />
                ))}
              </Bar>
            ))}
            {/* Total au-dessus de la pile, même si le dernier segment est vide : une ligne invisible porte l'étiquette. */}
            <Line dataKey="total" stroke="none" dot={false} activeDot={false} isAnimationActive={false} legendType="none">
              <LabelList dataKey="total" position="top" formatter={(v) => fmtTotal(Number(v))} className="ch-valeur" offset={8} />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
