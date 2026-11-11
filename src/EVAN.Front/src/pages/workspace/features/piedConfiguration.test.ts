import { describe, expect, it } from 'vitest';
import type { TachesConfig } from '@/store/avancement';
import { etatPied } from './PiedConfiguration';

const taches = (p: Partial<TachesConfig> = {}): TachesConfig => ({
  1: { adresse: true, batiment: true, contours: true },
  2: { hauteurs: true, zone: true },
  3: { posees: true, numeros: true },
  4: { organesVerifies: true, importeesDecrites: undefined },
  5: { branchees: true },
  ...p,
});

describe('pied du panneau de configuration', () => {
  it('cache « Étape précédente » à la première étape', () => {
    expect(etatPied(1, taches(), true).precedente).toBe(false);
    expect(etatPied(2, taches(), true).precedente).toBe(true);
  });

  it('dit pourquoi « Suivant » est grisé sans bâtiment', () => {
    const e = etatPied(1, taches({ 1: { adresse: true, batiment: false, contours: false } }), false);
    expect(e.bloque).toMatch(/bâtiment/);
    expect(e.principal).toBe(false);
  });

  it('laisse la tâche restante mener : « Suivant » secondaire tant qu’elle n’est pas faite', () => {
    expect(etatPied(1, taches({ 1: { adresse: true, batiment: true, contours: false } }), true).principal).toBe(false);
    expect(etatPied(1, taches(), true).principal).toBe(true);
  });

  it('ne compte pas une tâche qui ne se pose pas dans cette usine', () => {
    expect(etatPied(4, taches({ 4: { organesVerifies: true, importeesDecrites: undefined } }), true).principal).toBe(true);
  });
});
