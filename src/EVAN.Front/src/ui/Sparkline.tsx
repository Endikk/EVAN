import { Line, LineChart, ReferenceArea, YAxis } from 'recharts';
import type { Seuils } from '@/domain/types';

/**
 * Mini-courbe temps réel (Recharts) avec la plage normale (entre seuils d'attention) en fond. Décorative : la valeur
 * est écrite à côté. Sans couche d'accessibilité, recharts ne fait pas de chaque courbe un arrêt de tabulation sans nom.
 */
export function Sparkline({
  values,
  seuils,
  width = 120,
  height = 30,
  color = 'var(--series-1)',
}: {
  values: number[];
  seuils?: Seuils;
  width?: number;
  height?: number;
  color?: string;
}) {
  const vals = values.slice(-120);
  if (vals.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  const lo = seuils?.attentionBas;
  const hi = seuils?.attentionHaut;
  // La plage normale n'est montrée que si elle reste à l'échelle de la courbe.
  const span = Math.max(1e-6, max - min);
  const showLo = lo !== undefined && lo > min - span * 3;
  const showHi = hi !== undefined && hi < max + span * 3;
  if (showLo) min = Math.min(min, lo!);
  if (showHi) max = Math.max(max, hi!);
  const pad = Math.max(1e-6, max - min) * 0.1;
  const data = vals.map((v, i) => ({ i, v }));
  return (
    <LineChart width={width} height={height} data={data} margin={{ top: 2, right: 3, bottom: 2, left: 0 }} accessibilityLayer={false} aria-hidden="true" tabIndex={-1}>
      <YAxis hide domain={[min - pad, max + pad]} />
      {(showLo || showHi) && <ReferenceArea y1={showLo ? lo : min - pad} y2={showHi ? hi : max + pad} fill="var(--idle-soft)" fillOpacity={1} stroke="none" ifOverflow="hidden" />}
      <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
    </LineChart>
  );
}
