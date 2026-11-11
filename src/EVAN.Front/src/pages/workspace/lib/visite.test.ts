import { describe, expect, it } from 'vitest';
import { chapitreDepart, etapeOuvertureVisite } from './visite';

describe('visite lancée par l’adresse', () => {
  it('lit le chapitre de départ, le premier par défaut', () => {
    expect(chapitreDepart(new URLSearchParams('visite=6'))).toBe(6);
    expect(chapitreDepart(new URLSearchParams(''))).toBe(1);
    expect(chapitreDepart(new URLSearchParams('visite=abc'))).toBe(1);
    expect(chapitreDepart(new URLSearchParams('visite=40'))).toBe(12);
  });

  it('ouvre « Voir la démo » (chapitre 6) directement sur la supervision, sans passer par la carte', () => {
    expect(etapeOuvertureVisite(6)).toBe(6);
  });

  it('part de la carte pour les chapitres de la configuration', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(etapeOuvertureVisite(n)).toBe(1);
  });

  it('ouvre l’écran du chapitre en exploitation, la supervision pour les derniers', () => {
    expect(etapeOuvertureVisite(8)).toBe(8);
    expect(etapeOuvertureVisite(11)).toBe(6);
  });
});
