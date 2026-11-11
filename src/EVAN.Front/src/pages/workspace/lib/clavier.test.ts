import { describe, expect, it } from 'vitest';
import { flechesChangentEcran, type CibleClavier } from './clavier';

/** Cible factice : sa balise et les sélecteurs auxquels un de ses ancêtres répond. */
const cible = (tagName: string, ancetres: string[] = []): CibleClavier => ({
  tagName,
  closest: (sel: string) => (sel.split(',').some((s) => ancetres.includes(s.trim())) ? {} : null),
});

describe('flèches et changement d’écran', () => {
  it('changent d’écran quand rien n’a le focus', () => {
    expect(flechesChangentEcran(cible('BODY'))).toBe(true);
    expect(flechesChangentEcran(null)).toBe(true);
  });

  it('changent d’écran depuis le titre de l’écran, qui reçoit le focus à chaque changement', () => {
    expect(flechesChangentEcran(cible('H1', ['.ecran-titre']))).toBe(true);
  });

  it('changent d’écran depuis la scène 3D', () => {
    expect(flechesChangentEcran(cible('CANVAS', ['.stage']))).toBe(true);
    expect(flechesChangentEcran(cible('MAIN', ['.stage']))).toBe(true);
  });

  it('restent au bouton, à l’onglet ou au graphique qui a le focus', () => {
    expect(flechesChangentEcran(cible('BUTTON', ['.stage']))).toBe(false);
    expect(flechesChangentEcran(cible('BUTTON'))).toBe(false);
    expect(flechesChangentEcran(cible('svg'))).toBe(false);
    expect(flechesChangentEcran(cible('DIV'))).toBe(false);
  });

  it('laissent la carte satellite se déplacer', () => {
    expect(flechesChangentEcran(cible('CANVAS', ['.stage', '.maplibregl-map']))).toBe(false);
  });
});
