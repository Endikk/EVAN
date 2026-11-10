import { describe, expect, it } from 'vitest';
import { communeDe, parseCoordinates, variantesAdresse } from './search';

describe('recherche', () => {
  it('lit des coordonnées GPS collées, avec point ou virgule décimale', () => {
    expect(parseCoordinates('47.375835, 0.672815')).toEqual([0.672815, 47.375835]);
    expect(parseCoordinates('47,375835 0,672815')).toEqual([0.672815, 47.375835]);
    expect(parseCoordinates('-20.88742, 55.42556')).toEqual([55.42556, -20.88742]);
  });

  it('lit un lien Google Maps (la position épinglée prime sur le centre de la vue)', () => {
    const url = 'https://www.google.com/maps/place/Valtiq+SAS/@47.3758353,0.6703041,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d47.375835!4d0.672815';
    expect(parseCoordinates(url)).toEqual([0.672815, 47.375835]);
    expect(parseCoordinates('https://www.google.com/maps/@47.3758353,0.6703041,17z')).toEqual([0.6703041, 47.3758353]);
  });

  it('ne prend pas une adresse ou un SIRET pour des coordonnées', () => {
    expect(parseCoordinates('12 avenue Thérèse Voisin')).toBeNull();
    expect(parseCoordinates('49 1')).toBeNull();
    expect(parseCoordinates('38291245600017')).toBeNull();
    expect(parseCoordinates('95.1, 1.2')).toBeNull();
  });

  it('dépouille une adresse SIRENE des mentions qui font échouer le géocodeur', () => {
    expect(variantesAdresse('ZI DU MENNETON AVENUE THERESE VOISIN 37000 TOURS')).toContain('AVENUE THERESE VOISIN 37000 TOURS');
    const v = variantesAdresse('PARC D ACTIVITES DU MOULIN 12 BIS AVENUE DES PINS BP 45 27100 VAL DE REUIL CEDEX');
    expect(v[0]).toBe('PARC D ACTIVITES DU MOULIN 12 BIS AVENUE DES PINS BP 45 27100 VAL DE REUIL CEDEX');
    expect(v).toContain('12 BIS AVENUE DES PINS 27100 VAL DE REUIL');
    expect(v.every((x) => !/\bCEDEX\b|\bBP 45\b/.test(x) || x === v[0])).toBe(true);
  });

  it('extrait la commune d’une adresse pour nommer l’usine', () => {
    expect(communeDe('48 Rue Paul Sabatier 71530 Crissey')).toBe('Crissey');
    expect(communeDe('ZI DU MENNETON AVENUE THERESE VOISIN 37000 TOURS')).toBe('Tours');
    expect(communeDe('12 BIS AVENUE DES PINS BP 45 27100 VAL DE REUIL CEDEX')).toBe('Val de Reuil');
    expect(communeDe('58 AV LIBERATION 59300 AULNOY-LEZ-VALENCIENNES')).toBe('Aulnoy-lez-Valenciennes');
    expect(communeDe('Point GPS 47.38, 0.67')).toBeUndefined();
  });
});
