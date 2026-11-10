import { describe, expect, it } from 'vitest';
import { chemin, ecranDe, estConfiguration, lireChemin, slugDe, titreEcran } from './ecrans';
import type { Step } from '@/store/ui';

describe('adresses des écrans', () => {
  it('fait l’aller-retour entre chaque écran et son adresse', () => {
    const ecrans = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'organisation'] as const;
    for (const e of ecrans) {
      expect(lireChemin(chemin('demo', e))).toEqual({ mode: 'demo', ecran: e });
      expect(ecranDe(slugDe(e))).toBe(e);
    }
  });

  it('lit l’espace de travail seul, sans écran', () => {
    expect(lireChemin('/demo')).toEqual({ mode: 'demo' });
    expect(lireChemin('/assistant/')).toEqual({ mode: 'assistant' });
  });

  it('écarte les adresses hors de l’espace de travail', () => {
    expect(lireChemin('/')).toBeNull();
    expect(lireChemin('/demo/inconnu')).toBeNull();
    expect(lireChemin('/demo/plan/en-trop')).toBeNull();
    expect(lireChemin('/autre/plan')).toBeNull();
  });

  it('range les étapes 1 à 5 dans le paramétrage, le reste dans l’exploitation', () => {
    expect(([1, 2, 3, 4, 5] as Step[]).every(estConfiguration)).toBe(true);
    expect(([6, 7, 8, 9] as Step[]).some(estConfiguration)).toBe(false);
    expect(estConfiguration('organisation')).toBe(false);
  });

  it('donne un titre d’onglet à chaque écran', () => {
    expect(titreEcran(2)).toBe('Plan');
    expect(titreEcran(9)).toBe('Énergie');
    expect(titreEcran('organisation')).toBe('Toutes les usines');
  });
});
