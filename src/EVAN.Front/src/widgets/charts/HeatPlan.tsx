/**
 * Carte des arrêts (historique) : plan vu de dessus, cadré sur le site, chaque machine teintée selon son temps
 * de panne sur la période (une seule teinte, du gris au rouge) avec ses heures écrites dessous.
 * À côté du graphique, le plan remplit la hauteur de sa carte ; seul sur sa ligne, il prend la proportion du site.
 * Le survol d'une ligne des graphiques la désigne ici. Par défaut l'usine active ; la vue d'ensemble lui passe
 * chacune des usines de l'organisation. Quand les machines sont cliquables, elles se choisissent aussi au clavier
 * (Tab, puis Entrée) et chacune dit son temps de panne à un lecteur d'écran.
 */
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useProject, siteBounds, type Usine } from '@/store/project';
import { MODEL_FOOTPRINT } from '@/domain/catalog';
import { toLocal, type XY } from '@/geo/geodesy';
import { ZONE_COULEUR } from '@/widgets/scene/Zones3D';
import './charts.css';

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const H = 3_600_000;

export function HeatPlan({
  heat,
  selectedId,
  highlightId,
  onMachineClick,
  onHover,
  usine,
}: {
  /** Temps de panne par machine (ms). */
  heat: Record<string, number>;
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
  const rings = useMemo(() => (site ? batiments.map((b) => b.contour.map((p) => toLocal(site.repere, p))) : []), [site, batiments]);
  const bounds = useMemo(() => siteBounds(rings.flat()), [rings]);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(e.contentRect.width || 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!site) return null;

  const m = 3;
  const vb = [bounds.center[0] - bounds.size[0] / 2 - m, bounds.center[1] - bounds.size[1] / 2 - m, bounds.size[0] + 2 * m, bounds.size[1] + 2 * m];
  // Taille du texte : proportionnelle au plan, mais jamais sous 10 px à l'écran.
  const fs = Math.max(Math.max(vb[2], vb[3]) / 40, (10 * vb[2]) / boxW);
  const max = Math.max(1, ...Object.values(heat));
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
    return { mc, cx, bottom };
  });

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
                fill={ZONE_COULEUR[z.type]}
                fillOpacity={0.05}
                stroke={ZONE_COULEUR[z.type]}
                strokeOpacity={0.35}
                strokeDasharray="4 3"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {machines.map((mc) => {
              const fp = MODEL_FOOTPRINT[mc.type] ?? MODEL_FOOTPRINT.custom;
              const v = (heat[mc.id] ?? 0) / max;
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
                    fill={v > 0 ? 'var(--crit)' : 'var(--text-3)'}
                    fillOpacity={v > 0 ? 0.22 + v * 0.78 : 0.3}
                    stroke={on ? 'var(--accent)' : v > 0 ? 'var(--crit)' : 'var(--text-3)'}
                    strokeWidth={on ? 3 : 1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </g>
          {/* Étiquettes horizontales sous chaque machine, même tournée. */}
          {labels.map(({ mc, cx, bottom }) => {
            const on = mc.id === focus || mc.id === selectedId;
            const h = (heat[mc.id] ?? 0) / H;
            return (
              <g key={mc.id} style={{ pointerEvents: 'none' }}>
                <text x={cx} y={bottom + fs * 1.05} fontSize={fs} fontWeight={800} textAnchor="middle" fill={on ? 'var(--accent)' : 'var(--text)'}>
                  {mc.numero}
                </text>
                <text x={cx} y={bottom + fs * 1.95} fontSize={fs * 0.78} fontWeight={600} textAnchor="middle" fill={h > 0 ? 'var(--crit)' : 'var(--text-3)'}>
                  {nf.format(h)} h
                </text>
              </g>
            );
          })}
          <g transform={`translate(${vb[0] + vb[2] - fs * 1.8} ${vb[1] + fs * 1.8})`} aria-hidden>
            <circle r={fs * 1.2} fill="var(--surface)" stroke="var(--border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <path
              d={`M${north[0] * fs * 0.9},${north[1] * fs * 0.9} L${-north[1] * fs * 0.32},${north[0] * fs * 0.32} L${north[1] * fs * 0.32},${-north[0] * fs * 0.32}Z`}
              fill="var(--crit)"
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
            <i aria-hidden />
            <span>{nf.format(max / H)} h de panne</span>
          </>
        )}
      </div>
    </div>
  );
}
