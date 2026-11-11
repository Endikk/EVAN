import { describe, expect, it } from 'vitest';
import { erreurNombre, lireNombre } from './nombre';

describe('saisie d’un écart', () => {
  it('lit la virgule, le point et les espaces de milliers', () => {
    expect(lireNombre('339,5')).toBe(339.5);
    expect(lireNombre('339.5')).toBe(339.5);
    expect(lireNombre('1 200')).toBe(1200);
  });

  it('ne dit rien d’un champ vide ou juste', () => {
    expect(erreurNombre('')).toBeUndefined();
    expect(erreurNombre(' 339,5 ')).toBeUndefined();
  });

  it('signale une saisie qui n’est pas un nombre positif, au lieu de rester muet', () => {
    expect(erreurNombre('12 mm')).toBe('Un nombre seul, par exemple 339,5');
    expect(erreurNombre('abc')).toBe('Un nombre seul, par exemple 339,5');
    expect(erreurNombre('0')).toBe('Un nombre plus grand que zéro');
  });
});
