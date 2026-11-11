import { describe, expect, it } from 'vitest';
import { lienDemo, situerEtape } from './parcours';

describe('étapes du volet « Comment ça marche »', () => {
  it('compte les étapes de configuration sur cinq, comme l’assistant', () => {
    expect(situerEtape(1)).toBe('Configuration · étape 1 sur 5 · Localiser');
    expect(situerEtape(5)).toBe('Configuration · étape 5 sur 5 · Connexion');
  });

  it('ne numérote pas les écrans de tous les jours', () => {
    expect(situerEtape(6)).toBe('Chaque jour · Supervision');
    expect(situerEtape(7)).toBe('Chaque jour · Historique');
  });

  it('mène au chapitre de la visite qui raconte l’étape', () => {
    expect(lienDemo(1)).toBe('/demo?visite=1');
    expect(lienDemo(6)).toBe('/demo?visite=6');
  });
});
