import { describe, expect, it } from 'vitest';
import { etiquettesLisibles, type Etiquette } from './reperes';

const e = (x: number, y: number, w = 100, h = 24): Etiquette => ({ x, y, w, h });

describe('étiquettes des pièces sur la presse', () => {
  it('se lisent quand elles sont assez écartées', () => {
    expect(etiquettesLisibles([e(100, 50), e(220, 50), e(340, 50)], 800)).toBe(true);
  });

  it('ne se lisent plus quand deux noms se recouvrent sur la même ligne', () => {
    expect(etiquettesLisibles([e(100, 50), e(180, 50)], 800)).toBe(false);
  });

  it('se lisent quand deux voisines sont posées à des hauteurs différentes', () => {
    expect(etiquettesLisibles([e(100, 50), e(150, 90)], 800)).toBe(true);
  });

  it('gardent un peu d’air entre deux étiquettes qui se frôlent de côté', () => {
    // Bords à 2 px l'un de l'autre : moins que l'air demandé en travers.
    expect(etiquettesLisibles([e(100, 50), e(202, 50)], 800)).toBe(false);
    expect(etiquettesLisibles([e(100, 50), e(202, 50)], 800, { x: 0, y: 0 })).toBe(true);
    expect(etiquettesLisibles([e(100, 50), e(206, 50)], 800)).toBe(true);
  });

  it('acceptent deux rangées voisines presque jointives', () => {
    // Même colonne, 4 px entre les deux rangées : le balancement ne les rapproche pas en hauteur.
    expect(etiquettesLisibles([e(100, 50), e(110, 78)], 800)).toBe(true);
    expect(etiquettesLisibles([e(100, 50), e(110, 74)], 800)).toBe(false);
  });

  it('ne se lisent pas quand une étiquette sort de la toile', () => {
    expect(etiquettesLisibles([e(30, 50)], 800)).toBe(false);
    expect(etiquettesLisibles([e(780, 50)], 800)).toBe(false);
  });

  it('se lisent quand il n’y a rien à poser', () => {
    expect(etiquettesLisibles([], 390)).toBe(true);
  });
});
