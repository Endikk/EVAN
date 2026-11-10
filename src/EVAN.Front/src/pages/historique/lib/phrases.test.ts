import { describe, expect, it } from 'vitest';
import type { Machine } from '@/domain/types';
import { H } from '@/sim/history';
import { bilan, type LigneMachine } from './calculs';
import { dureeCourte, dureeEnMots, leconArrets, leconCourbe, leconJours, minusculeInitiale, verdictHistorique } from './phrases';

const machine = (numero: string): Machine => ({
  id: numero,
  batimentId: 'b',
  type: 'flexo',
  nom: `Presse ${numero}`,
  numero,
  position: [0, 0],
  rotationDeg: 0,
  modele: { url: '' },
});

const ligne = (numero: string, panneH: number, calageH: number, trs?: number): LigneMachine => ({
  m: machine(numero),
  panne: panneH * H,
  calage: calageH * H,
  marche: 10 * H,
  ouverture: (10 + panneH + calageH) * H,
  nPannes: panneH ? 2 : 0,
  parOrgane: new Map(),
  ...(trs !== undefined && { D: 0.9, P: 0.9, Q: 0.9, trs }),
});

describe('durées en mots', () => {
  it('dit les minutes et les heures avec des mots', () => {
    expect(dureeEnMots(20_000)).toBe('moins d’une minute');
    expect(dureeEnMots(9 * 60_000)).toBe('9\u00a0minutes');
    expect(dureeEnMots(H)).toBe('1\u00a0heure');
    expect(dureeEnMots(H + 5 * 60_000)).toBe('1\u00a0heure et 5\u00a0minutes');
  });

  it('écrit la durée courte du journal avec le même arrondi que la phrase', () => {
    const ms = 8 * 60_000 + 40_000;

    expect(dureeCourte(ms)).toBe('9\u00a0min');
    expect(dureeEnMots(ms)).toBe('9\u00a0minutes');
    expect(dureeCourte(20_000)).toBe('<\u00a01\u00a0min');
    expect(dureeCourte(H + 5 * 60_000)).toBe('1\u00a0h\u00a005');
    expect(dureeCourte(2 * H)).toBe('2\u00a0h');
  });
});

describe('verdict de l’historique', () => {
  it('rappelle la période et nomme la machine qui s’arrête le plus, avec sa cause', () => {
    const b = bilan([ligne('R07', 3.6, 12.2, 0.69), ligne('R01', 1, 2, 0.8)]);

    const v = verdictHistorique('7j', b);

    expect(v.verdict).toMatch(/^Sur 7\u00a0jours, les machines ont produit \d+\u00a0% du temps possible\.$/);
    expect(v.suite).toBe('R07 s’arrête le plus : 15,8\u00a0h, surtout pour des réglages.');
    expect(v.ton).toBe('neutre');
  });

  it('nomme la machine choisie et détaille ses arrêts', () => {
    const b = bilan([ligne('R07', 3.6, 12.2, 0.69)]);

    const v = verdictHistorique('24h', b, { numero: 'R07' }, 'rembobineur');

    expect(v.verdict.startsWith('Sur les dernières 24\u00a0heures, R07 a produit')).toBe(true);
    expect(v.suite).toBe('15,8\u00a0h d’arrêt, dont 3,6\u00a0h de pannes. Organe le plus touché : rembobineur.');
  });

  it('ne parle pas de « 0 h de pannes » quand la machine ne s’est arrêtée que pour des réglages', () => {
    const b = bilan([ligne('R07', 0, 2.2, 0.73)]);

    const v = verdictHistorique('24h', b, { numero: 'R07' });

    expect(v.suite).toBe('2,2\u00a0h d’arrêt, que des réglages.');
  });

  it('ne donne pas de chiffre quand aucune machine n’a tourné', () => {
    const b = bilan([ligne('R07', 0, 0)]);

    const v = verdictHistorique('24h', b);

    expect(v.verdict).toContain('n’ont pas tourné');
    expect(v.ton).toBe('neutre');
  });

  it('dit qu’une machine ajoutée n’a pas encore d’historique', () => {
    const v = verdictHistorique('7j', bilan([]), { numero: 'R09', creeLe: 1 });

    expect(v.verdict).toBe('R09 vient d’être ajoutée : elle n’a pas encore d’historique.');
  });
});

describe('leçons des graphiques', () => {
  it('compare réglages et pannes sur tout l’atelier, sans redire la machine du verdict', () => {
    const lecon = leconArrets([ligne('R07', 2, 12), ligne('R01', 1, 6)]);

    expect(lecon).toBe('Les réglages prennent 6 fois plus de temps que les pannes.');
  });

  it('tient chaque leçon sur une ligne de 90 caractères au plus', () => {
    const lignes = [ligne('R07', 2, 12, 0.69), ligne('R01', 1, 6, 0.8)];
    const jours = [
      { t: 1, trs: 70, D: 80, P: 92, Q: 97 },
      { t: 2, trs: 75, D: 84, P: 91, Q: 98 },
    ];

    const lecons = [leconArrets(lignes), leconArrets(lignes, lignes[0]), leconCourbe(0.96, 12), leconCourbe(1, 2), leconJours(jours)];

    for (const l of lecons) expect(l.length).toBeLessThanOrEqual(90);
  });

  it('dit la tenue de la plage normale pendant la production', () => {
    expect(leconCourbe(0.96, 3)).toBe('Dans la plage normale 96\u00a0% du temps de production. 3 alarmes levées.');
    expect(leconCourbe(undefined, 0)).toBe('Aucune alarme sur cette mesure.');
    expect(leconCourbe(1, 2)).toBe('Toujours dans la plage normale en production, hors les 2 alarmes levées.');
  });

  it('nomme la perte qui coûte le plus jour par jour', () => {
    const jours = [
      { t: 1, trs: 70, D: 80, P: 92, Q: 97 },
      { t: 2, trs: 75, D: 84, P: 91, Q: 98 },
    ];

    expect(leconJours(jours)).toBe('Ce qui coûte le plus : les arrêts.');
  });

  it('garde les sigles en majuscules en milieu de phrase', () => {
    expect(minusculeInitiale('Séchage UV')).toBe('séchage UV');
    expect(minusculeInitiale('RFID')).toBe('RFID');
  });
});
