import { describe, expect, it } from 'vitest';
import { borneNiveaux, composition, niveauDe, niveauOccupeMax, nomNiveau, nomNiveauCourt, nombreNiveaux, NIVEAUX_MAX } from './niveaux';

describe('niveaux d’un bâtiment', () => {
  it('une zone ou une machine sans niveau est au rez-de-chaussée', () => {
    expect(niveauDe({})).toBe(0);
    expect(niveauDe({ niveau: 2 })).toBe(2);
  });

  it('nomme le rez-de-chaussée et les étages', () => {
    expect(nomNiveau(0)).toBe('Rez-de-chaussée');
    expect(nomNiveau(1)).toBe('Étage 1');
    expect(nomNiveauCourt(0)).toBe('RDC');
    expect(nomNiveauCourt(3)).toBe('3');
  });

  it('dit de quoi le bâtiment est fait', () => {
    expect(composition(1)).toBe('Plain-pied');
    expect(composition(2)).toBe('Rez-de-chaussée et 1 étage');
    expect(composition(4)).toBe('Rez-de-chaussée et 3 étages');
  });

  it('l’usine a autant de niveaux que son bâtiment le plus haut, un au moins', () => {
    expect(nombreNiveaux([])).toBe(1);
    expect(nombreNiveaux([{ niveaux: 0 }, { niveaux: 1 }])).toBe(1);
    expect(nombreNiveaux([{ niveaux: 1 }, { niveaux: 3 }])).toBe(3);
  });

  it('borne le nombre de niveaux saisi', () => {
    expect(borneNiveaux(0)).toBe(1);
    expect(borneNiveaux(2.6)).toBe(3);
    expect(borneNiveaux(999)).toBe(NIVEAUX_MAX);
    expect(borneNiveaux(Number.NaN)).toBe(1);
  });

  it('retrouve le niveau le plus haut occupé dans un bâtiment', () => {
    const zones = [
      { batimentId: 'a', niveau: 1 },
      { batimentId: 'b', niveau: 4 },
    ];
    const machines = [{ batimentId: 'a', niveau: 2 }, { batimentId: 'a' }];
    expect(niveauOccupeMax('a', zones, machines)).toBe(2);
    expect(niveauOccupeMax('c', zones, machines)).toBe(0);
  });
});
