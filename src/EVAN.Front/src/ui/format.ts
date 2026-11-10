const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const dayTimeFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export const fmtTime = (t: number) => timeFmt.format(t);
export const fmtHM = (t: number) => shortFmt.format(t);
export const fmtDay = (t: number) => dayFmt.format(t);
export const fmtDayTime = (t: number) => dayTimeFmt.format(t);

export function fmtTimeMs(t: number) {
  const d = new Date(t);
  return `${timeFmt.format(t)}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

export function fmtDuration(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

export function fmtValue(v: number | undefined, unite?: string) {
  if (v === undefined || Number.isNaN(v)) return 'n.d.';
  const a = Math.abs(v);
  const digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 1 : 2;
  const s = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: a >= 100 || a === 0 ? 0 : Math.min(1, digits) }).format(v);
  return unite ? `${s} ${unite}` : s;
}

export const pct = (v: number, digits = 0) =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v * 100)} %`;

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
export const fmtDate = (t: number) => dateFmt.format(t);

/** Échéance relative : « aujourd’hui », « dans 3 j », « dépassée de 2 j ». */
export function fmtEcheance(t: number, now: number) {
  const j = Math.round((t - now) / 86_400_000);
  if (j === 0) return 'aujourd’hui';
  if (j > 0) return j === 1 ? 'demain' : `dans ${j} j`;
  return `dépassée de ${-j} j`;
}

export const fmtNombre = (v: number, digits = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
