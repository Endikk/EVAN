import { describe, expect, it } from 'vitest';
import { replieAuDepart } from './coquille';

describe('barre latérale au départ', () => {
  it('suit le choix gardé dans ce navigateur', () => {
    expect(replieAuDepart('1', false)).toBe(true);
    expect(replieAuDepart('0', true)).toBe(false);
  });

  it('part repliée sur tablette et dépliée sur grand écran, sans choix gardé', () => {
    expect(replieAuDepart(null, true)).toBe(true);
    expect(replieAuDepart(null, false)).toBe(false);
  });
});
