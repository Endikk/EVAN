import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Un stockage du navigateur en mémoire : vitest tourne sous Node, sans localStorage. Posé avant le premier import du
 *  module, qui lit les réglages retenus dès son chargement. */
const { stockage } = vi.hoisted(() => {
  const stockage = (): Storage => {
    const m = new Map<string, string>();
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(k),
      setItem: (k, v) => void m.set(k, String(v)),
    };
  };
  vi.stubGlobal('localStorage', stockage());
  return { stockage };
});

import { lireFacteur, lirePrix, parametres, REGLAGES_DEFAUT } from './reglages';

describe('lecture des réglages du calcul', () => {
  it('accepte un prix au kWh écrit à la française', () => {
    expect(lirePrix('0,15').valeur).toBe(0.15);
    expect(lirePrix(' 0.2 ').valeur).toBe(0.2);
  });

  it('refuse un prix nul, illisible, ou au MWh, en disant pourquoi', () => {
    expect(lirePrix('0').erreur).toMatch(/nuls/);
    expect(lirePrix('abc').erreur).toMatch(/par exemple 0,15/);
    expect(lirePrix('-1').erreur).toBeDefined();
    expect(lirePrix('150').erreur).toMatch(/MWh/);
    expect(lirePrix('2').valeur).toBe(2);
  });

  it('accepte un facteur nul mais pas une unité qui ne peut pas être des grammes par kWh', () => {
    expect(lireFacteur('0').valeur).toBe(0);
    expect(lireFacteur('40').valeur).toBe(40);
    expect(lireFacteur('25000').erreur).toMatch(/unité/);
  });

  it('garde le dernier réglage retenu quand la saisie est fausse', () => {
    expect(parametres({ prix: '150', facteurG: '40' }, { prix: '0,2', facteurG: '50' })).toEqual({ prixKwh: 0.2, facteurCo2: 0.04 });
    expect(parametres({ prix: '', facteurG: 'x' }, REGLAGES_DEFAUT).facteurCo2).toBeCloseTo(Number(REGLAGES_DEFAUT.facteurG) / 1000);
  });
});

describe('réglages retenus par usine', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', stockage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('retient le dernier prix valable de chaque usine et le retrouve au rechargement', async () => {
    const { useReglagesEnergie, saisieDe } = await import('./reglages');

    useReglagesEnergie.getState().regler('tours', { prix: '0,2', facteurG: '40' });
    useReglagesEnergie.getState().regler('tours', { prix: '150', facteurG: '40' });
    useReglagesEnergie.getState().regler('crissey', { prix: '0,18', facteurG: '55' });

    // La saisie fausse reste à l'écran le temps de la session…
    expect(saisieDe(useReglagesEnergie.getState(), 'tours').prix).toBe('150');

    // … mais un rechargement retrouve le dernier prix valable, usine par usine.
    vi.resetModules();
    const recharge = await import('./reglages');
    expect(recharge.saisieDe(recharge.useReglagesEnergie.getState(), 'tours')).toEqual({ prix: '0,2', facteurG: '40' });
    expect(recharge.saisieDe(recharge.useReglagesEnergie.getState(), 'crissey')).toEqual({ prix: '0,18', facteurG: '55' });
    expect(recharge.saisieDe(recharge.useReglagesEnergie.getState(), 'autre')).toEqual(recharge.REGLAGES_DEFAUT);
  });

  it('ignore un réglage stocké abîmé', async () => {
    localStorage.setItem('evan.energie.reglages', JSON.stringify({ tours: { prix: '150', facteurG: 12 } }));
    const { useReglagesEnergie, saisieDe, REGLAGES_DEFAUT: defaut } = await import('./reglages');

    expect(saisieDe(useReglagesEnergie.getState(), 'tours')).toEqual(defaut);
  });
});
