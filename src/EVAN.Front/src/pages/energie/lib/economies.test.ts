import { describe, expect, it } from 'vitest';
import { profilEnergie } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import type { History } from '@/sim/history';
import { economiesSur7Jours } from './economies';

const H = 3_600_000;
const DAY = 24 * H;
// Lundi 5 octobre 2026, minuit (heure de Paris, fixée par vitest.config.ts).
const lundi = new Date(2026, 9, 5).getTime();
const flexo: Machine = { id: 'm1', batimentId: 'b', type: 'flexo', nom: 'Flexo', numero: 'R01', position: [0, 0], rotationDeg: 0, modele: { url: '' } };

/** Deux jours : quatre calages d'une demi-heure et une nuit de veille le premier jour, puis de la production. */
const h: History = {
  debut: lundi,
  fin: lundi + 2 * DAY,
  periodes: {
    m1: [
      { debut: lundi, fin: lundi + 6 * H, etat: 'arret' },
      { debut: lundi + 6 * H, fin: lundi + 6.5 * H, etat: 'calage' },
      { debut: lundi + 6.5 * H, fin: lundi + 9 * H, etat: 'marche' },
      { debut: lundi + 9 * H, fin: lundi + 9.5 * H, etat: 'calage' },
      { debut: lundi + 9.5 * H, fin: lundi + 12 * H, etat: 'marche' },
      { debut: lundi + 12 * H, fin: lundi + 12.5 * H, etat: 'calage' },
      { debut: lundi + 12.5 * H, fin: lundi + 30 * H, etat: 'marche' },
      { debut: lundi + 30 * H, fin: lundi + 30.5 * H, etat: 'calage' },
      { debut: lundi + 30.5 * H, fin: lundi + 2 * DAY, etat: 'marche' },
    ],
  },
  alarmes: [],
  trs: {},
};
const params = { prixKwh: 0.2, facteurCo2: 0.04 };

describe('où économiser', () => {
  it('ramène toujours à un an depuis le début de l’historique, et écrit un plafond comme un plafond', () => {
    const actions = economiesSur7Jours(h, [flexo], '', lundi + 2 * DAY, params);
    const calage = actions.find((a) => a.cle === 'calage')!;
    const kwhCalage = 2 * profilEnergie('flexo').calage;

    expect(calage.kwhAn).toBeCloseTo((kwhCalage / 2) * 365);
    expect(calage.euroAn).toBeCloseTo((kwhCalage / 2) * 365 * 0.2);
    expect(calage.plafond).toBe(true);
    expect(calage.pourquoi).toMatch(/^Le plafond/);
    // Ce que rapporte un seul calage évité : 0,5 h de calage au prix du kWh.
    expect(calage.pourquoi).toContain('Chaque calage évité rapporte environ');
    expect(actions.find((a) => a.cle === 'veille')?.plafond).toBe(true);
  });

  it('ne dépend que de l’historique et de l’instant, jamais de la période affichée', () => {
    const a = economiesSur7Jours(h, [flexo], '', lundi + 2 * DAY, params);
    const b = economiesSur7Jours(h, [flexo], '', lundi + 2 * DAY, params);

    expect(a.map((x) => x.euroAn)).toEqual(b.map((x) => x.euroAn));
  });

  it('avec une machine choisie, ne compte que ses pertes et dit sa part de sa propre électricité', () => {
    const autre: Machine = { ...flexo, id: 'm2', numero: 'R02' };
    const h2: History = { ...h, periodes: { ...h.periodes, m2: [{ debut: lundi, fin: lundi + 2 * DAY, etat: 'arret' }] } };

    const seule = economiesSur7Jours(h2, [flexo, autre], 'm1', lundi + 2 * DAY, params);
    const veille = seule.find((a) => a.cle === 'veille')!;

    expect(veille.kwhAn).toBeCloseTo(((6 * profilEnergie('flexo').arret) / 2) * 365);
    expect(veille.part).toBeLessThan(1);
  });
});
