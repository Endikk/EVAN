import { describe, expect, it } from 'vitest';
import { lireChoixAnimations } from './ui';

describe('choix « Réduire les animations »', () => {
  it('relit le choix gardé dans les deux sens', () => {
    expect(lireChoixAnimations('reduites')).toBe(true);
    expect(lireChoixAnimations('normales')).toBe(false);
  });

  it('laisse la préférence du système s’appliquer sans choix gardé', () => {
    expect(lireChoixAnimations(null)).toBeNull();
    expect(lireChoixAnimations('autre')).toBeNull();
  });
});
