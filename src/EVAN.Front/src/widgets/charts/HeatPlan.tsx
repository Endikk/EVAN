/**
 * Carte des arrêts (historique) : plan vu de dessus, cadré sur le site, chaque machine teintée selon son temps
 * de panne sur la période (une seule teinte, de la surface au rouge de panne) avec ses heures écrites dessous. Le reste
 * du plan (murs, zones, nord) reste à l'encre : seule la panne prend de la couleur.
 * À côté du graphique, le plan remplit la hauteur de sa carte ; seul sur sa ligne, il prend la proportion du site.
 * Le survol d'une ligne des graphiques la désigne ici. Par défaut l'usine active ; la vue d'ensemble lui passe
 * chacune des usines de l'organisation. Quand les machines sont cliquables, elles se choisissent aussi au clavier
 * (Tab, puis Entrée) et chacune dit son temps de panne à un lecteur d'écran.
 *
 * Le texte garde une taille lisible quelle que soit l'échelle du plan (12 px pour le numéro, 11 px pour les heures, à
 * l'écran) : un grand site dans une petite carte ne réduit plus ses étiquettes à 6 px. Quand deux étiquettes se
 * chevaucheraient, les machines les plus touchées gardent les leurs, les autres gardent leur numéro ou rien ; le survol
 * et la légende donnent toujours les heures.
 *
 * Les teintes suivent cinq paliers (styles/graphiques.css), les mêmes sur les machines et dans les cases de la
 * légende : gris pour aucune panne, puis le rouge de panne de plus en plus couvrant au quart, à la moitié, aux trois
 * quarts et au plus long arrêt. Des paliers plutôt qu'un fondu : l'œil compare une machine à la légende case par case.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useProject, siteBounds, type Usine } from '@/store/project';
import { MODEL_FOOTPRINT } from '@/domain/catalog';
import { toLocal, type XY } from '@/geo/geodesy';
import './charts.css';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const H = 3_600_000;
/** Les cinq paliers (styles/graphiques.css, --panne-palier-0 à 4), posés aussi sur les cases de la légende. */
const PALIERS_LEGENDE = Object.fromEntries([0, 1, 2, 3, 4].map((k) => [`--p${k}`, `var(--panne-palier-${k})`])) as CSSProperties;
/** Tailles minimales du texte à l'écran, en pixels. */
const PX_NUMERO = 12;
const PX_HEURES = 11;
/** Chasse moyenne d'un caractère, en part de la taille du texte (sans pour le numéro, mono pour les heures). */
const CHASSE_SANS = 0.62;
const CHASSE_MONO = 0.6;

/** Palier d'une machine : 0 sans panne, puis 1 à 4 du quart au plus long arrêt de l'échelle. */
export function palier(ms: number, max: number): number {
  if (!(ms > 0) || !(max > 0)) return 0;
  return Math.min(4, Math.max(1, Math.ceil((ms / max) * 4)));
}

const teinte = (k: number) => `var(--panne-palier-${k})`;

interface Boite {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const chevauche = (a: Boite, b: Boite) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

export function HeatPlan({
  heat,
  selectedId,
  highlightId,
  onMachineClick,
  onHover,
  usine,
  echelleMax,
}: {
  /** Temps de panne par machine (ms). */
  heat: Record<string, number>;
  /**
   * Haut de l'échelle (ms) : par défaut la machine la plus touchée de ce plan. Deux plans posés côte à côte (vue
   * d'ensemble des usines) reçoivent le même, sinon une machine à 1,6 h serait aussi rouge qu'une autre à 2,9 h.
   */
  echelleMax?: number;
  /** Usine à dessiner (l'usine active par défaut). */
  usine?: Pick<Usine, 'site' | 'batiments' | 'zones' | 'machines'>;
  selectedId?: string;
  highlightId?: string;
  onMachineClick?(id: string): void;
  onHover?(id: string | undefined): void;
}) {
  const active = {
    site: useProject((s) => s.site),
    batiments: useProject((s) => s.batiments),
    zones: useProject((s) => s.zones),
    machines: useProject((s) => s.machines),
  };
  const { site, batiments, zones, machines } = usine ?? active;
  const [hover, setHover] = useState<string>();
  const box = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(600);
  const [boxH, setBoxH] = useState(400);
  const rings = useMemo(() => (site ? batiments.map((b) => b.contour.map((p) => toLocal(site.repere, p))) : []), [site, batiments]);
  const bounds = useMemo(() => siteBounds(rings.flat()), [rings]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setBoxW(e.contentRect.width || 600);
      setBoxH(e.contentRect.height || 400);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!site) return null;

  const m = 3;
  const vb = [bounds.center[0] - bounds.size[0] / 2 - m, bounds.center[1] - bounds.size[1] / 2 - m, bounds.size[0] + 2 * m, bounds.size[1] + 2 * m];
  // Pixels d'écran par mètre : le plan est centré dans sa boîte (meet), c'est le côté le plus serré qui fixe l'échelle.
  const echelle = Math.min(boxW / vb[2], boxH / vb[3]) || 1;
  // Taille du texte : proportionnelle au plan, mais jamais sous 12 px (numéro) ni 11 px (heures) à l'écran.
  const fs = Math.max(Math.max(vb[2], vb[3]) / 40, PX_NUMERO / echelle);
  const fsH = Math.max(fs * 0.78, PX_HEURES / echelle);
  const max = Math.max(1, echelleMax ?? 0, ...Object.values(heat));
  const a0 = (site.repere.angleDeg * Math.PI) / 180;
  const north: XY = [Math.sin(a0), -Math.cos(a0)];
  const focus = hover ?? highlightId;
  const fm = machines.find((x) => x.id === focus);

  const labels = machines.map((mc) => {
    const fp = MODEL_FOOTPRINT[mc.type] ?? MODEL_FOOTPRINT.custom;
    const a = (mc.rotationDeg * Math.PI) / 180;
    const corners = [fp.min, [fp.max[0], fp.min[1]], fp.max, [fp.min[0], fp.max[1]]].map(([x, z]) => [
      mc.position[0] + x * Math.cos(a) - z * Math.sin(a),
      mc.position[1] + x * Math.sin(a) + z * Math.cos(a),
    ]);
    const cx = (Math.min(...corners.map((c) => c[0])) + Math.max(...corners.map((c) => c[0]))) / 2;
    const bottom = Math.max(...corners.map((c) => c[1]));
    return { mc, cx, bottom, heures: `${nf.format((heat[mc.id] ?? 0) / H)} h` };
  });
  // Place des étiquettes, en deux passes, de la machine la plus touchée à la moins touchée : d'abord les numéros (qui
  // disent de quelle machine on parle), puis les heures là où il reste de la place. Une étiquette qui mordrait sur une
  // autre n'est pas posée.
  const posees: Boite[] = [];
  const visible = new Map<string, 'tout' | 'numero'>();
  const parPanne = [...labels].sort((a, b) => (heat[b.mc.id] ?? 0) - (heat[a.mc.id] ?? 0));
  // Un peu d'air de chaque côté (un cinquième de caractère) : deux étiquettes qui se touchent se lisent comme une seule.
  const air = fsH * 0.2;
  for (const l of parPanne) {
    const demi = (l.mc.numero.length * CHASSE_SANS * fs) / 2 + air;
    const numero: Boite = { x0: l.cx - demi, x1: l.cx + demi, y0: l.bottom + fs * 0.15, y1: l.bottom + fs * 1.3 };
    if (posees.some((b) => chevauche(b, numero))) continue;
    posees.push(numero);
    visible.set(l.mc.id, 'numero');
  }
  for (const l of parPanne) {
    if (!visible.has(l.mc.id)) continue;
    const demi = (l.heures.length * CHASSE_MONO * fsH) / 2 + air;
    const y0 = l.bottom + fs * 1.3;
    const heures: Boite = { x0: l.cx - demi, x1: l.cx + demi, y0, y1: y0 + fsH * 1.15 };
    if (posees.some((b) => chevauche(b, heures))) continue;
    posees.push(heures);
    visible.set(l.mc.id, 'tout');
  }

  return (
    <div className="heatplan">
      <div className="heatplan-box" ref={box} style={{ '--plan-ar': vb[2] / vb[3] } as CSSProperties}>
        <svg viewBox={vb.join(' ')} preserveAspectRatio="xMidYMid meet" role={onMachineClick ? 'group' : 'img'} aria-label="Carte des arrêts sur panne par machine">
          <g>
            {rings.map((r, i) => (
              <polygon
                key={i}
                points={r.map((p) => p.join(',')).join(' ')}
                className="hp-building"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            ))}
            {zones.map((z) => (
              <polygon
                key={z.id}
                points={z.polygone.map((p) => p.join(',')).join(' ')}
                // Les zones ne servent qu'à se repérer : un filet discontinu neutre, pas leur couleur de la scène 3D.
                fill="none"
                stroke="var(--border-strong)"
                strokeDasharray="4 3"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {machines.map((mc) => {
              const fp = MODEL_FOOTPRINT[mc.type] ?? MODEL_FOOTPRINT.custom;
              const k = palier(heat[mc.id] ?? 0, max);
              const on = mc.id === focus || mc.id === selectedId;
              const designer = () => (setHover(mc.id), onHover?.(mc.id));
              const lacher = () => (setHover(undefined), onHover?.(undefined));
              return (
                <g
                  key={mc.id}
                  transform={`translate(${mc.position[0]} ${mc.position[1]})`}
                  style={{ cursor: onMachineClick ? 'pointer' : undefined }}
                  onClick={() => onMachineClick?.(mc.id)}
                  onPointerEnter={designer}
                  onPointerLeave={lacher}
                  {...(onMachineClick && {
                    role: 'button',
                    tabIndex: 0,
                    'aria-pressed': mc.id === selectedId,
                    'aria-label': `${mc.numero} ${mc.nom} : ${nf.format((heat[mc.id] ?? 0) / H)} h de panne`,
                    onFocus: designer,
                    onBlur: lacher,
                    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      onMachineClick(mc.id);
                    },
                  })}
                >
                  <rect
                    transform={`rotate(${mc.rotationDeg})`}
                    x={fp.min[0] - 0.4}
                    y={fp.min[1] - 0.4}
                    width={fp.max[0] - fp.min[0] + 0.8}
                    height={fp.max[1] - fp.min[1] + 0.8}
                    rx={0.6}
                    fill={teinte(k)}
                    stroke={on ? 'var(--text)' : k > 0 ? 'var(--crit)' : 'var(--text-3)'}
                    strokeOpacity={on ? 1 : 0.55}
                    strokeWidth={on ? 2 : 1}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </g>
          {/* Étiquettes horizontales sous chaque machine, même tournée. */}
          {labels.map(({ mc, cx, bottom, heures }) => {
            const on = mc.id === focus || mc.id === selectedId;
            const place = visible.get(mc.id);
            // La machine désignée montre toujours son numéro, même si la place manquait : on sait de qui parle la légende.
            if (!place && !on) return null;
            return (
              <g key={mc.id} style={{ pointerEvents: 'none' }}>
                <text
                  x={cx}
                  y={bottom + fs * 1.05}
                  fontSize={fs}
                  fontWeight={500}
                  textAnchor="middle"
                  fill={on ? 'var(--text)' : 'var(--text-2)'}
                  className="hp-texte"
                  strokeWidth={fs * 0.28}
                >
                  {mc.numero}
                </text>
                {/* Les heures en mono, à l'encre discrète : le texte ne prend jamais la couleur de la marque. */}
                {place === 'tout' && (
                  <text
                    x={cx}
                    y={bottom + fs * 1.05 + fsH * 1.1}
                    fontSize={fsH}
                    fontFamily="var(--mono)"
                    textAnchor="middle"
                    fill="var(--text-3)"
                    className="hp-texte"
                    strokeWidth={fsH * 0.28}
                  >
                    {heures}
                  </text>
                )}
              </g>
            );
          })}
          <g transform={`translate(${vb[0] + vb[2] - fs * 1.8} ${vb[1] + fs * 1.8})`} aria-hidden>
            <circle r={fs * 1.2} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <path
              d={`M${north[0] * fs * 0.9},${north[1] * fs * 0.9} L${-north[1] * fs * 0.32},${north[0] * fs * 0.32} L${north[1] * fs * 0.32},${-north[0] * fs * 0.32}Z`}
              fill="var(--text-2)"
            />
          </g>
        </svg>
      </div>
      <div className="heat-legend">
        {fm ? (
          <span>
            <b>{fm.numero}</b> {fm.nom} · <b>{nf.format((heat[fm.id] ?? 0) / H)} h</b> de panne
          </span>
        ) : (
          <>
            <span>0 h</span>
            <i aria-hidden style={PALIERS_LEGENDE} />
            <span>{nf.format(max / H)} h de panne</span>
          </>
        )}
      </div>
    </div>
  );
}
