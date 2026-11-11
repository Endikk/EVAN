import { describe, expect, it } from 'vitest';
import { ADRESSE_DEMO, actionUsine } from './actions';

describe('actions de l’accueil', () => {
  it('ouvre la démo à la supervision, où une panne arrive', () => {
    expect(ADRESSE_DEMO).toBe('/demo?visite=6');
  });

  it('ouvre les usines du compte connecté sans en créer une vide', () => {
    for (const enregistree of [true, false]) {
      const a = actionUsine('connecte', enregistree);
      expect(a).toEqual({ to: '/assistant', libelle: 'Ouvrir mes usines' });
      expect(a.to).not.toContain('nouveau');
    }
  });

  it('reprend l’usine du navigateur, ou en démarre une, sans serveur', () => {
    expect(actionUsine('sansApi', true)).toEqual({ to: '/assistant', libelle: 'Reprendre mon usine' });
    expect(actionUsine('sansApi', false)).toEqual({ to: '/assistant?nouveau=1', libelle: 'Commencer avec mon usine' });
  });

  it('prévient que l’usine reste dans le navigateur quand un serveur existe mais que personne n’est connecté', () => {
    const a = actionUsine('anonyme', false);
    expect(a.to).toBe('/assistant?nouveau=1');
    expect(a.note).toBe('Sans connexion, l’usine reste dans ce navigateur.');
    expect(actionUsine('anonyme', true).note).toBe(a.note);
  });

  it('garde le bouton habituel tant que la session n’est pas connue', () => {
    expect(actionUsine('inconnu', false)).toEqual({ to: '/assistant?nouveau=1', libelle: 'Commencer avec mon usine' });
    expect(actionUsine('inconnu', true).note).toBeUndefined();
  });
});
