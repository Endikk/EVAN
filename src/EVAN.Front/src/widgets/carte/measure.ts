import type { Batiment } from '@/domain/types';
import {
  areaSigma,
  geodesicDistance,
  geodesicMeasure,
  minAreaRect,
  computeFrame,
  frameAzimuth,
  toLocal,
  type LngLat,
  type XY,
} from '@/geo/geodesy';

export interface BuildingMeasure {
  /** Emprise au sol géodésique (m²). */
  area: number;
  /** Écart-type de la surface (m²), propagé depuis la précision des sommets. */
  sigma: number;
  perimeter: number;
  length: number;
  width: number;
  azimuth: number;
  edges: number[];
  /** Surface de plancher estimée (emprise × niveaux). */
  floorArea: number;
  volume: number;
  /** Compacité : 1 pour un rectangle plein. */
  rectangularity: number;
  vertices: number;
}

export function measureBuilding(b: Pick<Batiment, 'contour' | 'sigmas' | 'hauteur' | 'niveaux'>): BuildingMeasure {
  const ring = b.contour;
  const { area, perimeter } = geodesicMeasure(ring);
  const frame = computeFrame(ring);
  const local = ring.map((p) => toLocal(frame, p));
  const rect = minAreaRect(local);
  const sigma = areaSigma(local, b.sigmas);
  const edges = ring.map((p, i) => geodesicDistance(p, ring[(i + 1) % ring.length]));
  return {
    area,
    sigma,
    perimeter,
    length: rect.length,
    width: rect.width,
    azimuth: frameAzimuth(frame),
    edges,
    floorArea: area * Math.max(1, b.niveaux || 1),
    volume: area * (b.hauteur || 0),
    rectangularity: rect.length * rect.width > 0 ? area / (rect.length * rect.width) : 0,
    vertices: ring.length,
  };
}

/** Écart-type d'un sommet posé à la main : précision de l'orthophoto ⊕ taille d'un pixel au zoom de saisie. */
export const ORTHO_SIGMA = 0.6;
export function handSigma(mpp: number): number {
  return Math.sqrt(ORTHO_SIGMA ** 2 + (1.5 * mpp) ** 2);
}

/**
 * Libellé qualitatif de la précision relative, avec son ton : à partir de « Bonne », on peut se fier à la surface
 * telle quelle ; en dessous, mieux vaut replacer les coins du contour sur la photo.
 */
export function precisionLabel(rel: number): { label: string; score: number; ton: 'ok' | 'warn' } {
  if (rel < 0.005) return { label: 'Excellente', score: 0.98, ton: 'ok' };
  if (rel < 0.015) return { label: 'Très bonne', score: 0.85, ton: 'ok' };
  if (rel < 0.03) return { label: 'Bonne', score: 0.7, ton: 'ok' };
  if (rel < 0.06) return { label: 'Moyenne', score: 0.48, ton: 'warn' };
  return { label: 'Faible', score: 0.25, ton: 'warn' };
}

export function ringToGeoJSON(ring: LngLat[]): GeoJSON.Polygon {
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
}

export function edgesToGeoJSON(ring: LngLat[], sigmas: number[]): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: ring.map((p, i) => {
      const j = (i + 1) % ring.length;
      return {
        type: 'Feature',
        properties: { s: ((sigmas[i] ?? 1) + (sigmas[j] ?? 1)) / 2, i },
        geometry: { type: 'LineString', coordinates: [p, ring[j]] },
      };
    }),
  };
}

/** Aimantation d'un sommet déplacé : côtés adjacents alignés sur les axes du bâtiment s'ils en sont proches. */
export function snapVertex(local: XY[], i: number, p: XY, tolDeg = 4): XY {
  const n = local.length;
  if (n < 3) return p;
  const prev = local[(i - 1 + n) % n];
  const next = local[(i + 1) % n];
  const snapDir = (a: XY, b: XY): XY | null => {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const q = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
    return Math.abs(ang - q) <= (tolDeg * Math.PI) / 180 ? [Math.cos(q), Math.sin(q)] : null;
  };
  const d1 = snapDir(prev, p);
  const d2 = snapDir(next, p);
  if (d1 && d2 && Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) > 0.5) {
    // Intersection des deux droites aimantées.
    const den = d1[0] * d2[1] - d1[1] * d2[0];
    const t = ((next[0] - prev[0]) * d2[1] - (next[1] - prev[1]) * d2[0]) / den;
    return [prev[0] + t * d1[0], prev[1] + t * d1[1]];
  }
  const proj = (a: XY, d: XY): XY => {
    const t = (p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1];
    return [a[0] + t * d[0], a[1] + t * d[1]];
  };
  if (d1) return proj(prev, d1);
  if (d2) return proj(next, d2);
  return p;
}
