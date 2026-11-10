import { describe, expect, it } from 'vitest';
import { bande as bandeLibre, boite, cadrer, centrer, chevauche, enveloppe, type Pt, type Rect } from './cadrage';

/** Une « presse » vue de trois quarts : une bande penchée qui descend vers la droite, de 300 × 100 px à d = 10. */
const bande = (d: number): Pt[] => {
  const k = 10 / d;
  const pts: Pt[] = [
    [-150, -80],
    [150, 20],
    [150, 80],
    [-150, -20],
  ];
  return pts.map(([x, y]) => [500 + x * k, 400 + y * k] as const);
};

describe('géométrie du cadrage', () => {
  it('la boîte englobante couvre tous les points', () => {
    expect(boite([[1, 5], [4, 2], [3, 9]])).toEqual({ x0: 1, y0: 2, x1: 4, y1: 9 });
  });

  it('l’enveloppe convexe écarte les points intérieurs', () => {
    const env = enveloppe([[0, 0], [10, 0], [10, 10], [0, 10], [5, 5], [2, 3]]);
    expect(env).toHaveLength(4);
    expect(env).not.toContainEqual([5, 5]);
  });

  it('détecte un recouvrement, et l’absence de recouvrement le long d’une diagonale', () => {
    const losange: Pt[] = [[50, 0], [100, 50], [50, 100], [0, 50]];
    expect(chevauche(losange, { x0: 40, y0: 40, x1: 60, y1: 60 })).toBe(true);
    // Le coin du rectangle frôle le côté du losange sans y entrer : aucun axe de la boîte ne les sépare, seule la
    // normale du côté le fait.
    expect(chevauche(losange, { x0: 0, y0: 0, x1: 20, y1: 20 })).toBe(false);
  });

  it('agrandit la presse jusqu’à remplir la zone libre', () => {
    const libre: Rect = { x0: 0, y0: 0, x1: 1000, y1: 800 };
    const c = cadrer(bande, libre, [], 1, 100);
    const pts = bande(c.dist).map(([x, y]) => [x - c.ox, y - c.oy] as const);
    const b = boite(pts);
    // La largeur est la contrainte : 300 px à d = 10 deviennent 1000 px.
    expect(b.x1 - b.x0).toBeCloseTo(1000, 0);
    expect(b.x0).toBeGreaterThanOrEqual(-0.5);
    expect(b.y1).toBeLessThanOrEqual(800.5);
  });

  it('laisse libre le coin du texte en bas à gauche', () => {
    const libre: Rect = { x0: 0, y0: 0, x1: 1000, y1: 800 };
    const texte: Rect = { x0: 0, y0: 560, x1: 420, y1: 800 };
    const c = cadrer(bande, libre, [texte], 1, 100);
    const env = enveloppe(bande(c.dist).map(([x, y]) => [x - c.ox, y - c.oy] as const));
    expect(chevauche(env, texte)).toBe(false);
    const b = boite(env);
    expect(b.x0).toBeGreaterThanOrEqual(-0.5);
    expect(b.x1).toBeLessThanOrEqual(1000.5);
  });

  it('la bande de la presse s’arrête au-dessus des blocs du bas, pas sous la carte du haut', () => {
    const libre: Rect = { x0: 0, y0: 0, x1: 1000, y1: 800 };
    const b = bandeLibre(libre, [
      { x0: 0, y0: 560, x1: 420, y1: 800 },
      { x0: 760, y0: 600, x1: 1000, y1: 800 },
      { x0: 760, y0: 0, x1: 1000, y1: 150 },
    ]);
    expect(b).toEqual({ x0: 0, y0: 0, x1: 1000, y1: 560 });
  });

  it('une barre qui traverse le haut (la carte sur téléphone) rogne la bande par le haut', () => {
    const libre: Rect = { x0: 0, y0: 0, x1: 400, y1: 600 };
    const b = bandeLibre(libre, [{ x0: 10, y0: 0, x1: 390, y1: 50 }]);
    expect(b).toEqual({ x0: 0, y0: 50, x1: 400, y1: 600 });
  });

  it('centre la presse dans la zone, quels que soient les obstacles', () => {
    const zone: Rect = { x0: 0, y0: 0, x1: 1000, y1: 560 };
    const carte: Rect = { x0: 760, y0: 0, x1: 1000, y1: 150 };
    const c = centrer(bande, zone, [carte], 1, 100);
    const env = enveloppe(bande(c.dist).map(([x, y]) => [x - c.ox, y - c.oy] as const));
    const b = boite(env);
    expect((b.x0 + b.x1) / 2).toBeCloseTo(500, 0);
    expect((b.y0 + b.y1) / 2).toBeCloseTo(280, 0);
    expect(chevauche(env, carte)).toBe(false);
    expect(b.x1 - b.x0).toBeGreaterThan(600);
  });
});
