import { describe, expect, it } from 'vitest';
import { placerCarte, type Cadre } from './placementCarte';

/** Scène d'un écran de 1440 px, à gauche du panneau de droite. */
const cadre: Cadre = { largeur: 776, hauteur: 700, marge: 12, haut: 64, bas: 60, ecart: 28 };
const fiche: [number, number] = [330, 420];

describe('place de la fiche d’un organe', () => {
  it('garde sa place habituelle quand elle tient à droite de l’organe', () => {
    expect(placerCarte([200, 150], [180, 170], fiche, cadre)).toEqual([200, 150]);
  });

  it('passe à gauche de l’organe au lieu de glisser sous le panneau de droite', () => {
    const [x] = placerCarte([600, 150], [580, 170], fiche, cadre);
    expect(x).toBe(580 - 28 - 330);
    expect(x + fiche[0]).toBeLessThanOrEqual(cadre.largeur - cadre.marge);
  });

  it('reste dans la vue en bas comme en haut', () => {
    const [, bas] = placerCarte([200, 600], [180, 620], fiche, cadre);
    expect(bas + fiche[1]).toBeLessThanOrEqual(cadre.hauteur - cadre.bas);
    const [, haut] = placerCarte([200, -80], [180, -60], fiche, cadre);
    expect(haut).toBe(cadre.haut);
  });

  it('se borne au bord quand ni la droite ni la gauche ne suffisent (tablette en portrait)', () => {
    const etroit: Cadre = { ...cadre, largeur: 420 };
    const [x] = placerCarte([300, 150], [280, 170], fiche, etroit);
    expect(x).toBe(420 - 12 - 330);
  });

  it('colle sous les commandes du haut une fiche plus haute que la vue', () => {
    expect(placerCarte([200, 300], [180, 320], [330, 640], cadre)[1]).toBe(cadre.haut);
  });
});
