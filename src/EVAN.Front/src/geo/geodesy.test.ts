import { describe, expect, it } from 'vitest';
import demo from '@data/demo.json';
import { areaSigma, computeFrame, fromLocal, geodesicMeasure, minAreaRect, orthogonalize, pointInPolygon, signedArea, toLocal, type LngLat, type XY } from './geodesy';

const usines = (demo as unknown as { usines: { batiments: { contour: LngLat[] }[] }[] }).usines;
const batA = usines[0].batiments[0].contour;

describe('géodésie', () => {
  it('mesure l’emprise BD TOPO du bâtiment d’exemple (≈ 5 999 m²)', () => {
    const { area, perimeter } = geodesicMeasure(batA);
    expect(area).toBeGreaterThan(5985);
    expect(area).toBeLessThan(6012);
    expect(perimeter).toBeGreaterThan(340);
  });

  it('mesure l’emprise des Ateliers Brennac à Crissey (≈ 4 842 m²)', () => {
    const { area, perimeter } = geodesicMeasure(usines[1].batiments[0].contour);
    expect(area).toBeGreaterThan(4830);
    expect(area).toBeLessThan(4855);
    expect(perimeter).toBeGreaterThan(278);
  });

  it('le repère local conserve la surface (écart < 0,01 %)', () => {
    const frame = computeFrame(batA);
    const local = batA.map((p) => toLocal(frame, p));
    const planar = Math.abs(signedArea(local));
    const { area } = geodesicMeasure(batA);
    expect(Math.abs(planar - area) / area).toBeLessThan(1e-4);
  });

  it('aller-retour lon/lat → local → lon/lat au millimètre', () => {
    const frame = { origin: [0.67, 47.375] as LngLat, angleDeg: -13.7 };
    const p: LngLat = [0.6712345, 47.3761234];
    const back = fromLocal(frame, toLocal(frame, p));
    expect(Math.abs(back[0] - p[0]) * 75000).toBeLessThan(0.001);
    expect(Math.abs(back[1] - p[1]) * 111000).toBeLessThan(0.001);
  });

  it('le grand axe du repère suit le grand côté', () => {
    const rect = minAreaRect([
      [0, 0],
      [100, 10],
      [96, 50],
      [-4, 40],
    ]);
    expect(rect.length).toBeGreaterThan(rect.width);
  });

  it('dans chaque usine d’exemple, zones et machines sont dans leur bâtiment, chaque machine dans sa zone', () => {
    type Usine = {
      site: { nom: string; repere: { origin: LngLat; angleDeg: number } };
      batiments: { id: string; contour: LngLat[] }[];
      zones: { id: string; batimentId: string; polygone: XY[] }[];
      machines: { numero: string; batimentId: string; zoneId?: string; position: XY }[];
    };
    for (const u of (demo as unknown as { usines: Usine[] }).usines) {
      const ring = (id: string) => u.batiments.find((b) => b.id === id)!.contour.map((p) => toLocal(u.site.repere, p));
      for (const z of u.zones) for (const c of z.polygone) expect(pointInPolygon(c, ring(z.batimentId)), `${u.site.nom} · ${z.id}`).toBe(true);
      for (const m of u.machines) {
        expect(pointInPolygon(m.position, ring(m.batimentId)), `${u.site.nom} · ${m.numero}`).toBe(true);
        const zone = u.zones.find((z) => z.id === m.zoneId);
        if (zone) expect(pointInPolygon(m.position, zone.polygone), `${u.site.nom} · ${m.numero} dans ${zone.id}`).toBe(true);
      }
    }
  });

  it('l’équerrage redresse un quadrilatère presque rectangle', () => {
    const pts: XY[] = [
      [0, 0],
      [50, 0.8],
      [49.5, 30],
      [0.4, 29.4],
    ];
    const { points } = orthogonalize(pts, 12);
    expect(points).toHaveLength(4);
    for (let i = 0; i < 4; i++) {
      const a = points[i];
      const b = points[(i + 1) % 4];
      const c = points[(i + 2) % 4];
      const dot = (b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1]);
      expect(Math.abs(dot)).toBeLessThan(1e-6);
    }
  });

  it('incertitude de surface d’un carré de 100 m avec σ = 1 m', () => {
    const sq: XY[] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ];
    // σ_A = ½·√(4 · 1² · (100√2)²) = 100√2 ≈ 141 m²
    expect(areaSigma(sq, [1, 1, 1, 1])).toBeCloseTo(141.42, 1);
  });
});
