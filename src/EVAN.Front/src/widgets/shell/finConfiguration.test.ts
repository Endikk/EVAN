import { describe, expect, it } from 'vitest';
import { bilanFinConfiguration } from './finConfiguration';

describe('bilan avant de terminer la configuration', () => {
  it('prévient qu’aucune machine n’est posée', () => {
    expect(bilanFinConfiguration([], {})?.titre).toBe('0 machine posée');
  });

  it('compte les machines non branchées', () => {
    const machines = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(bilanFinConfiguration(machines, { a: { etat: 'connectee' }, b: { etat: 'test' } })?.titre).toBe('2 machines sur 3 non branchées');
    expect(bilanFinConfiguration(machines, { a: { etat: 'connectee' }, b: { etat: 'connectee' } })?.titre).toBe('1 machine sur 3 non branchée');
  });

  it('ne dit rien quand tout est posé et branché', () => {
    expect(bilanFinConfiguration([{ id: 'a' }], { a: { etat: 'connectee' } })).toBeUndefined();
  });
});
