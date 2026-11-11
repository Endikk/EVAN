import { describe, expect, it } from 'vitest';
import type { BilanUsine } from '@/analytics/energy';
import type { Machine } from '@/domain/types';
import type { History } from '@/sim/history';
import { courbeParActivite, graduations, lireCourbe } from './courbe';
import { compterPeriodes } from './economies';
import { fmtJours } from './format';
import { leconCourbe, leconParMachine, phraseCourbe, phraseParJour, phraseRepartition, surCent, tonHorsProduction, verdictEnergie } from './lecture';

const H = 3_600_000;
const NB = ' ';
// Lundi 5 octobre 2026, minuit (heure de Paris, fixée par vitest.config.ts).
const lundi = new Date(2026, 9, 5, 0, 0, 0).getTime();

function bilan(kwh: { marche: number; calage: number; arret: number; panne: number }, prix = 0.15): BilanUsine {
  const total = kwh.marche + kwh.calage + kwh.arret + kwh.panne;
  return {
    total: { kwh, total, production: 1000, unite: 'étiquettes', co2: total * 0.04, cout: total * prix },
    parMachine: [],
    horsProduction: total ? (total - kwh.marche) / total : 0,
  };
}

const flexo: Machine = { id: 'm1', batimentId: 'b', type: 'flexo', nom: 'Flexo', numero: 'R01', position: [0, 0], rotationDeg: 0, modele: { url: '' } };

function historique(periodes: [number, number, 'marche' | 'calage' | 'panne' | 'arret'][]): History {
  return {
    debut: lundi,
    fin: lundi + 48 * H,
    periodes: { m1: periodes.map(([a, b, etat]) => ({ debut: lundi + a * H, fin: lundi + b * H, etat })) },
    alarmes: [],
    trs: {},
  };
}

describe('verdict de l’écran énergie', () => {
  it('dit combien, combien d’euros et la part sans produire, avec le ton qui va avec', () => {
    const v = verdictEnergie(bilan({ marche: 35_900, calage: 2_512, arret: 1_882, panne: 290 }), '7j');
    expect(v.verdict).toBe(`Sur 7 jours, l’usine a consommé 40,6${NB}MWh, soit 6${'\u202f'}088${NB}€, dont 12${NB}% sans rien produire.`);
    expect(v.ton).toBe('warn');
    // Les deux plus grosses pertes seulement, de la plus grosse à la plus petite, en quelques mots.
    expect(v.suite).toBe('Surtout en réglages (calages), puis en veille.');
  });

  it('change de ton selon la part dépensée sans produire', () => {
    expect(tonHorsProduction(0.05)).toBe('ok');
    expect(tonHorsProduction(0.12)).toBe('warn');
    expect(tonHorsProduction(0.4)).toBe('crit');
  });

  it('ne parle pas de part quand rien n’a été consommé', () => {
    const v = verdictEnergie(bilan({ marche: 0, calage: 0, arret: 0, panne: 0 }), '24h');
    expect(v.ton).toBe('neutre');
    expect(v.verdict).toContain('aucune consommation');
  });

  it('dit « sans rien produire » quand toute l’énergie est partie en veille', () => {
    const v = verdictEnergie(bilan({ marche: 0, calage: 0, arret: 569, panne: 0 }), '24h');
    expect(v.verdict).toMatch(/sans rien produire\.$/);
    expect(v.suite).toBe('Toute l’énergie est partie en veille.');
    expect(v.ton).toBe('crit');
  });

  it('nomme la machine choisie à la place de l’usine', () => {
    expect(verdictEnergie(bilan({ marche: 900, calage: 50, arret: 50, panne: 0 }), '7j', 'R07').verdict.startsWith('Sur 7 jours, R07 a consommé')).toBe(true);
  });

  it('arrondit la part de production comme la ligne de « Où part l’énergie »', () => {
    // 885,5 sur 1 000 : la ligne dit 89 %, la phrase dit 89 aussi.
    expect(phraseRepartition(bilan({ marche: 885.5, calage: 50, arret: 64.5, panne: 0 }))).toBe('Sur 100 kWh consommés, 89 ont servi à produire.');
  });

  it('nomme la seule perte quand il n’y en a qu’une', () => {
    const v = verdictEnergie(bilan({ marche: 900, calage: 0, arret: 100, panne: 0 }), '7j');
    expect(v.suite).toBe('Cette part est partie en veille.');
  });
});

describe('sur 100 kWh', () => {
  it('arrondit les parts pour que leur somme fasse exactement 100', () => {
    const cent = surCent(bilan({ marche: 885, calage: 62, arret: 46, panne: 7 }));
    expect(cent.marche + cent.calage + cent.arret + cent.panne).toBe(100);
    expect(cent).toEqual({ marche: 88, calage: 6, arret: 5, panne: 1 });
  });
});

describe('courbe de charge', () => {
  // Lundi : production de 5 h à 21 h, veille la nuit ; mardi : veille toute la journée.
  const h = historique([
    [0, 5, 'arret'],
    [5, 21, 'marche'],
    [21, 48, 'arret'],
  ]);
  const points = courbeParActivite(h, [flexo], lundi, lundi + 48 * H, H);
  const lecture = lireCourbe(points, H);

  it('sépare la puissance des machines qui travaillent du reste', () => {
    expect(points[6]).toEqual({ t: lundi + 6 * H, kw: 72, kwActif: 72 });
    expect(points[2]).toEqual({ t: lundi + 2 * H, kw: 3, kwActif: 0 });
  });

  it('repère les creux, leur nature et le talon de veille', () => {
    expect(lecture.creux.map((c) => [c.debut - lundi, c.fin - lundi].map((t) => t / H))).toEqual([
      [0, 5],
      [21, 48],
    ]);
    expect(lecture.creux.map((c) => c.nature)).toEqual(['nuit', 'week-end']);
    expect(lecture.talon).toBeCloseTo(3, 9);
    expect(lecture.kwhCreux).toBeCloseTo(32 * 3, 9);
    expect(lecture.pic).toEqual({ t: lundi + 5 * H, kw: 72 });
  });

  it('garde un creux court quand la période le coupe (fin de nuit, nuit qui commence)', () => {
    const pts = courbeParActivite(h, [flexo], lundi + 4 * H, lundi + 23 * H, H);
    const l = lireCourbe(pts, H);
    expect(l.creux.map((c) => [(c.debut - lundi) / H, (c.fin - lundi) / H])).toEqual([
      [4, 5],
      [21, 23],
    ]);
  });

  it('dit au lecteur d’écran le pic, puis ce que l’usine tire quand rien ne produit', () => {
    const phrase = phraseCourbe(lecture, '24h', 0.15);
    expect(phrase).toContain(`Le pic : 72${NB}kW, lundi 5 à 05:00.`);
    expect(phrase).toContain(`l’usine tire encore 3${NB}kW : 96${NB}kWh sur 24 heures, soit 14${NB}€.`);
  });

  it('tire la leçon en une ligne : ce que coûte ce qui reste allumé quand rien ne produit', () => {
    const lecon = leconCourbe(lecture, '24h', 0.15);
    expect(lecon).toBe(`La nuit et le week-end, l’usine tire encore 3${NB}kW sans produire : 14${NB}€ sur 24 heures.`);
    expect(lecon.length).toBeLessThanOrEqual(90);
  });

  it('gradue l’axe à minuit sur plusieurs jours, toutes les 3 heures sur une journée', () => {
    expect(graduations(lundi + 2 * H, lundi + 4 * 24 * H)).toHaveLength(3);
    expect(graduations(lundi + H, lundi + 10 * H).map((t) => (t - lundi) / H)).toEqual([3, 6, 9]);
  });
});

describe('énergie par jour et calcul des économies', () => {
  it('nomme le jour sans production, sinon le jour le plus chargé', () => {
    const jour = (j: number, marche: number, arret: number) => ({ jour: lundi + j * 24 * H, kwh: { marche, calage: 0, arret, panne: 0 }, total: marche + arret });
    expect(phraseParJour([jour(0, 7000, 100), jour(6, 0, 569)])).toBe(`Dimanche 11, sans rien produire : 569${NB}kWh de veille.`);
    expect(phraseParJour([jour(0, 7000, 100), jour(1, 5000, 80)])).toBe(`Le jour le plus chargé : lundi 5, 7${' '}100${NB}kWh.`);
  });

  it('laisse le jour en cours hors de la comparaison : pas fini, il n’est pas un jour sans production', () => {
    const jour = (j: number, marche: number, arret: number) => ({ jour: lundi + j * 24 * H, kwh: { marche, calage: 0, arret, panne: 0 }, total: marche + arret });
    const jours = [jour(0, 7000, 100), jour(1, 0, 40)];

    expect(phraseParJour(jours, lundi + 24 * H)).toBe(`Le jour le plus chargé : lundi 5, 7${'\u202f'}100${NB}kWh.`);
  });

  it('nomme la machine qui dépense le plus sans produire, en kWh et en euros', () => {
    const b = bilan({ marche: 900, calage: 50, arret: 50, panne: 0 });
    const m = (numero: string, calage: number) => ({
      machine: { ...flexo, id: numero, numero },
      bilan: { kwh: { marche: 1000, calage, arret: 0, panne: 0 }, total: 1000 + calage, production: 0, unite: 'étiquettes', co2: 0, cout: 0 },
    });

    expect(leconParMachine({ ...b, parMachine: [m('R01', 10), m('R07', 400)] }, 0.15)).toBe(`R07 dépense le plus sans produire : 400${NB}kWh, soit 60${NB}€.`);
  });

  it('compte les calages et leur durée sur la fenêtre seulement', () => {
    const h = historique([
      [1, 2, 'calage'],
      [3, 3.5, 'calage'],
      [10, 12, 'calage'],
    ]);
    expect(compterPeriodes(h, [flexo], lundi, lundi + 11 * H, 'calage')).toEqual({ nombre: 3, heures: 2.5 });
  });

  it('écrit le nombre de jours observés avec la précision du calcul', () => {
    expect(fmtJours(6.953)).toBe('6,95 jours');
    expect(fmtJours(1)).toBe('1 jour');
  });
});
