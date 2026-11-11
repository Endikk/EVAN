import { describe, expect, it } from 'vitest';
import { classeTrait } from './PanelHeader';

describe('traits de progression de la configuration', () => {
  it('marque l’étape courante, quel que soit son état', () => {
    expect(classeTrait(3, 3, 'faite')).toBe('en-cours');
    expect(classeTrait(3, 3, 'a-faire')).toBe('en-cours');
  });

  it('remplit une étape faite, pas une étape seulement dépassée', () => {
    expect(classeTrait(1, 3, 'faite')).toBe('fait');
    expect(classeTrait(2, 3, 'a-reprendre')).toBe('a-reprendre');
    expect(classeTrait(5, 3, 'a-faire')).toBe('');
  });
});
