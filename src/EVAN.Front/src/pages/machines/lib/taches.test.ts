import { describe, expect, it } from 'vitest';
import { etatPose, numerotationOk, problemeNumeros } from './taches';

describe('état de la pose des machines', () => {
  it('rien n’est fait tant qu’aucune machine n’est posée', () => {
    const e = etatPose([]);
    expect(e.total).toBe(0);
    expect(numerotationOk(e)).toBe(false);
  });

  it('repère un numéro porté par deux machines', () => {
    const e = etatPose([
      { numero: 'R01', nom: 'Gallus' },
      { numero: 'R02', nom: 'Rotative offset' },
      { numero: 'R02 ', nom: 'Rotative offset' },
    ]);
    expect(e.numerosEnDouble).toEqual(['R02']);
    expect(numerotationOk(e)).toBe(false);
    expect(problemeNumeros(e)).toBe('Deux machines portent le numéro R02.');
  });

  it('compte les machines sans numéro avant les doublons', () => {
    const e = etatPose([
      { numero: '', nom: 'A' },
      { numero: 'R01', nom: 'B' },
    ]);
    expect(e.sansNumero).toBe(1);
    expect(problemeNumeros(e)).toBe('Une machine n’a pas de numéro.');
  });

  it('range les noms en double du plus fréquent au moins fréquent', () => {
    const e = etatPose([
      { numero: 'RF01', nom: 'Refendeuse' },
      { numero: 'RF02', nom: 'Refendeuse' },
      { numero: 'R02', nom: 'Rotative offset' },
      { numero: 'R03', nom: 'Rotative offset' },
      { numero: 'R04', nom: 'Rotative offset' },
    ]);
    expect(e.nomsEnDouble).toEqual([
      { nom: 'Rotative offset', n: 3 },
      { nom: 'Refendeuse', n: 2 },
    ]);
    expect(numerotationOk(e)).toBe(true);
  });
});
