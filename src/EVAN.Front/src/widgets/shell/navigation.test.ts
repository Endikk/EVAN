import { describe, expect, it } from 'vitest';
import { panneASuivre } from './navigation';

describe('panne simulée', () => {
  it('est suivie par la caméra depuis la vue de toute l’usine', () => {
    expect(panneASuivre(undefined, { kind: 'site' })).toBe(true);
  });

  it('n’arrache pas l’utilisateur d’une machine choisie ou d’une pièce suivie', () => {
    expect(panneASuivre('m1', { kind: 'site' })).toBe(false);
    expect(panneASuivre(undefined, { kind: 'organe', machineId: 'm1', organeId: 'm1.o2' })).toBe(false);
    expect(panneASuivre('m1', { kind: 'machine', machineId: 'm1' })).toBe(false);
  });
});
