import { describe, expect, it } from 'vitest';
import type { Machine } from '@/domain/types';
import type { History } from '@/sim/history';
import { bilanMachine, bilanUsine, courbeDeCharge, energieParJour, gisements, puissance, uniteProduction } from './energy';

const H = 3_600_000;
const t0 = new Date(2026, 9, 5, 0, 0, 0).getTime();

const flexo: Machine = { id: 'm1', batimentId: 'b', type: 'flexo', nom: 'Flexo', numero: 'R01', position: [0, 0], rotationDeg: 0, modele: { url: '' } };

function historique(periodes: [number, number, 'marche' | 'calage' | 'panne' | 'arret'][]): History {
  return {
    debut: t0,
    fin: t0 + 24 * H,
    periodes: { m1: periodes.map(([a, b, etat]) => ({ debut: t0 + a * H, fin: t0 + b * H, etat })) },
    alarmes: [],
    trs: { m1: [{ jour: t0, disponibilite: 1, performance: 0.9, qualite: 0.98, trs: 0.88, ouvertureMin: 600, marcheMin: 60, panneMin: 0, calageMin: 0 }] },
  };
}

describe('énergie', () => {
  it('donne la puissance par état, attention = marche', () => {
    expect(puissance('flexo', 'marche')).toBe(72);
    expect(puissance('flexo', 'attention')).toBe(72);
    expect(puissance('flexo', 'arret')).toBe(3);
  });

  it('intègre les périodes : kWh par état, CO₂, coût et production', () => {
    const h = historique([
      [0, 2, 'arret'],
      [2, 3, 'marche'],
      [3, 3.5, 'calage'],
      [3.5, 3.75, 'panne'],
    ]);
    const b = bilanMachine(h, flexo, t0, t0 + 24 * H, { facteurCo2: 0.05, prixKwh: 0.2 });
    expect(b.kwh).toEqual({ marche: 72, calage: 19, panne: 4.5, arret: 6 });
    expect(b.total).toBe(101.5);
    expect(b.co2).toBeCloseTo(5.075, 6);
    expect(b.cout).toBeCloseTo(20.3, 6);
    // 60 min × 150 m/min ÷ 0,11 m × performance × qualité
    expect(b.production).toBeCloseTo(60 * (150 / 0.11) * 0.9 * 0.98, 3);
    expect(b.intensite).toBeCloseTo((101.5 / b.production) * 1000, 6);
  });

  it('ne compte que la fenêtre demandée', () => {
    const h = historique([[0, 10, 'marche']]);
    expect(bilanMachine(h, flexo, t0 + 2 * H, t0 + 4 * H).kwh.marche).toBe(144);
  });

  it('la courbe de charge est la puissance moyenne de chaque tranche', () => {
    const h = historique([
      [0, 0.5, 'arret'],
      [0.5, 1, 'marche'],
    ]);
    const c = courbeDeCharge(h, [flexo], t0, t0 + H, H);
    expect(c).toHaveLength(1);
    expect(c[0].kw).toBeCloseTo((3 + 72) / 2, 6);
  });

  it('coupe les jours à minuit', () => {
    const h = historique([[22, 26, 'marche']]);
    h.fin = t0 + 48 * H;
    const jours = energieParJour(h, [flexo], t0, t0 + 48 * H);
    expect(jours.map((j) => j.kwh.marche)).toEqual([144, 144]);
  });

  it('rapporte l’énergie de l’usine aux étiquettes imprimées et chiffre la veille', () => {
    const h = historique([
      [0, 10, 'arret'],
      [10, 12, 'marche'],
    ]);
    const b = bilanUsine(h, [flexo], t0, t0 + 24 * H);
    expect(b.total.unite).toBe('étiquettes imprimées');
    expect(b.horsProduction).toBeCloseTo(30 / (30 + 144), 6);
    const veille = gisements(b, 1).find((g) => g.id === 'veille')!;
    expect(veille.kwhAn).toBeCloseTo(30 * 365, 6);
  });

  it('convertit la vitesse en unités produites selon le type', () => {
    expect(uniteProduction('sheeter')).toMatchObject({ unite: 'feuilles' });
    expect(uniteProduction('ctp').parMinute(24)).toBeCloseTo(0.4, 6);
  });
});
