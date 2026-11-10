import { describe, expect, it } from 'vitest';
import { basculer, machinesVerifiees } from './verification';

describe('machines vérifiées', () => {
  it('une usine en cours de configuration part de zéro', () => {
    expect(machinesVerifiees(undefined, ['m1', 'm2'], false).size).toBe(0);
  });

  it('une usine déjà configurée compte toutes ses machines tant que rien n’est coché', () => {
    expect([...machinesVerifiees(undefined, ['m1', 'm2'], true)]).toEqual(['m1', 'm2']);
  });

  it('la liste cochée l’emporte, sans les machines retirées depuis', () => {
    expect([...machinesVerifiees(['m1', 'm9'], ['m1', 'm2'], true)]).toEqual(['m1']);
  });

  it('cocher puis décocher', () => {
    const avant = new Set(['m1']);
    expect(basculer(avant, 'm2')).toEqual(['m1', 'm2']);
    expect(basculer(avant, 'm1')).toEqual([]);
  });
});
