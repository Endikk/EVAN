import { describe, expect, it } from 'vitest';
import { ORDRE_ZONES, ZONE_COURT, ZONE_SENS, typesDistincts } from './typesZone';

describe('types de zone', () => {
  it('chaque type a son explication courte et sa phrase', () => {
    for (const t of ORDRE_ZONES) {
      expect(ZONE_COURT[t].length).toBeGreaterThan(0);
      expect(ZONE_SENS[t].endsWith('.')).toBe(true);
    }
  });

  it('compte les types différents, pas les zones', () => {
    expect(typesDistincts([])).toBe(0);
    expect(typesDistincts([{ type: 'atelier' }, { type: 'atelier' }])).toBe(1);
    expect(typesDistincts([{ type: 'atelier' }, { type: 'stock' }])).toBe(2);
  });
});
