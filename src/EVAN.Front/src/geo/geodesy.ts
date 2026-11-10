/**
 * Géodésie pour le relevé d'emprise.
 *
 * - Surface et périmètre calculés sur l'ellipsoïde WGS84 (algorithme de Karney, GeographicLib) :
 *   c'est la surface « vraie » au sol, sans déformation de projection.
 * - Repère local métrique (Est-Nord tangent, tourné sur l'axe principal du bâtiment) pour
 *   la 3D, le plan 2D, l'aimantation et les cotes. Sur quelques centaines de mètres,
 *   l'écart avec la géodésique est inférieur au millimètre.
 * - Incertitude de surface propagée depuis la précision de chaque sommet.
 */
import { Geodesic } from 'geographiclib-geodesic';

export type LngLat = [number, number];
export type XY = [number, number];

/** Repère local : origine géographique et angle de l'axe x local par rapport à l'Est (degrés, sens trigonométrique). */
export interface Frame {
  origin: LngLat;
  angleDeg: number;
}

const WGS84 = Geodesic.WGS84;
const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Retire le point de fermeture s'il duplique le premier. */
export function openRing<T extends XY | LngLat>(ring: T[]): T[] {
  if (ring.length > 1) {
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Surface (m²) et périmètre (m) géodésiques d'un anneau lon/lat. */
export function geodesicMeasure(ring: LngLat[]): { area: number; perimeter: number } {
  const pts = openRing(ring);
  if (pts.length < 3) return { area: 0, perimeter: 0 };
  const poly = WGS84.Polygon(false);
  for (const [lng, lat] of pts) poly.AddPoint(lat, lng);
  const r = poly.Compute(false, true);
  return { area: Math.abs(r.area ?? 0), perimeter: r.perimeter };
}

/** Distance géodésique (m) entre deux points. */
export function geodesicDistance(a: LngLat, b: LngLat): number {
  return WGS84.Inverse(a[1], a[0], b[1], b[0]).s12 ?? 0;
}

function radii(latDeg: number) {
  const s = Math.sin(latDeg * D2R);
  const w = Math.sqrt(1 - E2 * s * s);
  return { N: A / w, M: (A * (1 - E2)) / (w * w * w) };
}

/** Coordonnées Est-Nord (m) autour d'une origine. */
export function toENU(origin: LngLat, p: LngLat): XY {
  const { N, M } = radii(origin[1]);
  return [(p[0] - origin[0]) * D2R * N * Math.cos(origin[1] * D2R), (p[1] - origin[1]) * D2R * M];
}

export function fromENU(origin: LngLat, [e, n]: XY): LngLat {
  const { N, M } = radii(origin[1]);
  return [origin[0] + (e / (N * Math.cos(origin[1] * D2R))) * R2D, origin[1] + (n / M) * R2D];
}

/**
 * Passage au repère local du bâtiment. x suit l'axe principal, z pointe « vers le bas » du plan
 * (convention Three.js : y vertical, caméra du dessus avec -z en haut de l'écran).
 */
export function toLocal(frame: Frame, p: LngLat): XY {
  const [e, n] = toENU(frame.origin, p);
  const t = frame.angleDeg * D2R;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const u = e * c + n * s;
  const w = -e * s + n * c;
  return [u, -w];
}

export function fromLocal(frame: Frame, [x, z]: XY): LngLat {
  const w = -z;
  const t = frame.angleDeg * D2R;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return fromENU(frame.origin, [x * c - w * s, x * s + w * c]);
}

/** Surface signée (formule du lacet), positive dans le sens trigonométrique. */
export function signedArea(pts: XY[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

export function polygonCentroid(pts: XY[]): XY {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const c = x1 * y2 - x2 * y1;
    a += c;
    cx += (x1 + x2) * c;
    cy += (y1 + y2) * c;
  }
  if (Math.abs(a) < 1e-9) {
    const n = pts.length || 1;
    return [pts.reduce((s, p) => s + p[0], 0) / n, pts.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function convexHull(points: XY[]): XY[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: XY[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: XY[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export interface OrientedRect {
  /** Angle du grand côté par rapport à l'axe x (radians, dans ]-π/2, π/2]). */
  angle: number;
  length: number;
  width: number;
  center: XY;
  corners: XY[];
}

/** Plus petit rectangle englobant (calipers tournants sur l'enveloppe convexe). */
export function minAreaRect(points: XY[]): OrientedRect {
  const hull = convexHull(points);
  let best: OrientedRect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const [x1, y1] = hull[i];
    const [x2, y2] = hull[(i + 1) % hull.length];
    const t = Math.atan2(y2 - y1, x2 - x1);
    const c = Math.cos(t);
    const s = Math.sin(t);
    let minU = Infinity;
    let maxU = -Infinity;
    let minV = Infinity;
    let maxV = -Infinity;
    for (const [x, y] of hull) {
      const u = x * c + y * s;
      const v = -x * s + y * c;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea - 1e-9) {
      bestArea = area;
      let angle = t;
      let length = maxU - minU;
      let width = maxV - minV;
      if (width > length) {
        angle += Math.PI / 2;
        [length, width] = [width, length];
      }
      while (angle <= -Math.PI / 2) angle += Math.PI;
      while (angle > Math.PI / 2) angle -= Math.PI;
      const cu = (minU + maxU) / 2;
      const cv = (minV + maxV) / 2;
      const center: XY = [cu * c - cv * s, cu * s + cv * c];
      const corners: XY[] = [
        [minU, minV],
        [maxU, minV],
        [maxU, maxV],
        [minU, maxV],
      ].map(([u, v]) => [u * c - v * s, u * s + v * c] as XY);
      best = { angle, length, width, center, corners };
    }
  }
  return best ?? { angle: 0, length: 0, width: 0, center: [0, 0], corners: [] };
}

/** Repère local d'un bâtiment : origine au centroïde, axe x sur le grand côté. */
export function computeFrame(ring: LngLat[]): Frame {
  const pts = openRing(ring);
  const provisional = pts[0];
  const enu = pts.map((p) => toENU(provisional, p));
  const c = polygonCentroid(enu);
  const origin = fromENU(provisional, c);
  const rect = minAreaRect(enu.map(([x, y]) => [x - c[0], y - c[1]] as XY));
  return { origin, angleDeg: rect.angle * R2D };
}

/**
 * Écart-type de la surface (m²) pour des sommets d'écart-type σᵢ par coordonnée.
 * ∂A/∂xᵢ = (yᵢ₊₁ − yᵢ₋₁)/2, ∂A/∂yᵢ = (xᵢ₋₁ − xᵢ₊₁)/2  ⇒  σ_A = ½·√Σ σᵢ²·|pᵢ₊₁ − pᵢ₋₁|²
 */
export function areaSigma(pts: XY[], sigmas: number[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const next = pts[(i + 1) % n];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const si = sigmas[i] ?? sigmas[0] ?? 0;
    s += si * si * (dx * dx + dy * dy);
  }
  return 0.5 * Math.sqrt(s);
}

/** Mètres par pixel écran pour MapLibre (tuiles de 512 px). */
export function metersPerPixel(latDeg: number, zoom: number): number {
  return (40075016.686 * Math.cos(latDeg * D2R)) / (512 * 2 ** zoom);
}

function distPointSegment(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Supprime les sommets doublons et les sommets quasi alignés (écart < tolérance en mètres).
 * Renvoie les indices conservés pour garder les précisions associées.
 */
export function simplifyIndices(pts: XY[], tolerance = 0.25): number[] {
  let idx = pts.map((_, i) => i);
  let changed = true;
  while (changed && idx.length > 3) {
    changed = false;
    for (let k = 0; k < idx.length && idx.length > 3; k++) {
      const prev = pts[idx[(k - 1 + idx.length) % idx.length]];
      const cur = pts[idx[k]];
      const next = pts[idx[(k + 1) % idx.length]];
      const dup = Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) < 0.05;
      if (dup || distPointSegment(cur, prev, next) < tolerance) {
        idx = idx.filter((_, j) => j !== k);
        changed = true;
        k--;
      }
    }
  }
  return idx;
}

function intersectLines(p1: XY, d1: XY, p2: XY, d2: XY): XY | null {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return [p1[0] + t * d1[0], p1[1] + t * d1[1]];
}

/**
 * « Équerrage » : redresse à 90° les côtés proches des axes principaux du bâtiment,
 * puis recalcule chaque sommet comme intersection de deux côtés consécutifs.
 * Les côtés réellement obliques (au-delà de la tolérance) sont conservés.
 */
export function orthogonalize(pts: XY[], toleranceDeg = 12): { points: XY[]; source: number[] } {
  const n = pts.length;
  if (n < 4) return { points: pts, source: pts.map((_, i) => i) };
  type Line = { p: XY; d: XY; len: number; snapped: number | null; from: number };
  const tol = toleranceDeg * D2R;
  const lines: Line[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ang = Math.atan2(dy, dx);
    const q = Math.round(ang / (Math.PI / 2));
    const snappedAng = q * (Math.PI / 2);
    const isSnap = Math.abs(ang - snappedAng) <= tol;
    const useAng = isSnap ? snappedAng : ang;
    lines.push({
      p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      d: [Math.cos(useAng), Math.sin(useAng)],
      len,
      snapped: isSnap ? ((q % 4) + 4) % 4 : null,
      from: i,
    });
  }
  // Fusion des côtés consécutifs parallèles et presque colinéaires (écart < 0,6 m).
  const merged: Line[] = [];
  for (const l of lines) {
    const last = merged[merged.length - 1];
    if (last && last.snapped !== null && l.snapped !== null && last.snapped % 2 === l.snapped % 2) {
      const off = Math.abs((l.p[0] - last.p[0]) * -last.d[1] + (l.p[1] - last.p[1]) * last.d[0]);
      if (off < 0.6) {
        const w = last.len + l.len;
        last.p = [(last.p[0] * last.len + l.p[0] * l.len) / w, (last.p[1] * last.len + l.p[1] * l.len) / w];
        last.len = w;
        continue;
      }
    }
    merged.push({ ...l });
  }
  if (merged.length > 2) {
    const first = merged[0];
    const last = merged[merged.length - 1];
    if (first.snapped !== null && last.snapped !== null && first.snapped % 2 === last.snapped % 2) {
      const off = Math.abs((first.p[0] - last.p[0]) * -last.d[1] + (first.p[1] - last.p[1]) * last.d[0]);
      if (off < 0.6) {
        const w = last.len + first.len;
        first.p = [(last.p[0] * last.len + first.p[0] * first.len) / w, (last.p[1] * last.len + first.p[1] * first.len) / w];
        first.len = w;
        first.from = last.from;
        merged.pop();
      }
    }
  }
  if (merged.length < 3) return { points: pts, source: pts.map((_, i) => i) };
  const out: XY[] = [];
  const source: number[] = [];
  for (let i = 0; i < merged.length; i++) {
    const prev = merged[(i - 1 + merged.length) % merged.length];
    const cur = merged[i];
    const hit = intersectLines(prev.p, prev.d, cur.p, cur.d);
    const vertexIndex = cur.from;
    if (hit) {
      out.push(hit);
      source.push(vertexIndex);
    } else {
      // Côtés parallèles décalés : on insère un retour perpendiculaire passant par le sommet d'origine.
      const v = pts[vertexIndex];
      const proj = (l: Line): XY => {
        const t = (v[0] - l.p[0]) * l.d[0] + (v[1] - l.p[1]) * l.d[1];
        return [l.p[0] + t * l.d[0], l.p[1] + t * l.d[1]];
      };
      out.push(proj(prev), proj(cur));
      source.push(vertexIndex, vertexIndex);
    }
  }
  return { points: out, source };
}

export function pointInPolygon(p: XY | LngLat, ring: (XY | LngLat)[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Point intérieur le plus éloigné des bords (pour poser une étiquette dans un L ou un U). */
export function labelPoint(pts: XY[]): XY {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of pts) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const edgeDist = (p: XY) => {
    let d = Infinity;
    for (let i = 0; i < pts.length; i++) d = Math.min(d, distPointSegment(p, pts[i], pts[(i + 1) % pts.length]));
    return d;
  };
  let best: XY = polygonCentroid(pts);
  let bestD = pointInPolygon(best, pts) ? edgeDist(best) : -1;
  const n = 36;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n; j++) {
      const p: XY = [minX + ((maxX - minX) * i) / n, minY + ((maxY - minY) * j) / n];
      if (!pointInPolygon(p, pts)) continue;
      const d = edgeDist(p);
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  return best;
}

/** Azimut (degrés depuis le Nord, sens horaire) de l'axe x local. */
export function frameAzimuth(frame: Frame): number {
  return (((90 - frame.angleDeg) % 360) + 360) % 360;
}

const nfArea = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nfLen = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const formatArea = (m2: number) => `${nfArea.format(Math.round(m2))} m²`;
export const formatLength = (m: number) => `${nfLen.format(m)} m`;
export const formatNumber = (v: number, digits = 0) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
