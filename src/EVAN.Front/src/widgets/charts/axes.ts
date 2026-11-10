/** Unité de l'axe vertical, écrite en petit gris au-dessus des graduations (« kW », « °C », « alarmes »). */
export const uniteAxe = (value: string) => ({ value, position: 'insideTopLeft' as const, offset: 0, dy: -16, dx: 6, fontSize: 11, fill: 'var(--text-3)' });

/** Graduations rondes (1, 2, 2,5 ou 5 × 10ⁿ) dans un intervalle : l'axe se lit « 0, 50, 100 », pas « -18,8, 51,2 ». */
export function graduationsRondes(lo: number, hi: number, cible = 5): number[] {
  const brut = (hi - lo) / cible;
  if (!(brut > 0)) return [lo];
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= brut) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / pas) * pas; v <= hi + pas * 1e-9; v += pas) out.push(Number(v.toFixed(10)));
  return out;
}
