import { describe, expect, it } from 'vitest';
import type { Alarme, Machine } from '@/domain/types';
import { DAY, H, type History } from '@/sim/history';
import { bilan, bilanAlarmes, ligneMachine, tenueMesure } from './calculs';

const m: Machine = { id: 'r1', batimentId: 'b', type: 'flexo', nom: 'Presse', numero: 'R01', position: [0, 0], rotationDeg: 0, modele: { url: '' } };
const debut = Date.UTC(2026, 9, 5);

const histoire: History = {
  debut,
  fin: debut + DAY,
  periodes: {
    r1: [
      { debut, fin: debut + 5 * H, etat: 'arret' },
      { debut: debut + 5 * H, fin: debut + 6 * H, etat: 'calage' },
      { debut: debut + 6 * H, fin: debut + 10 * H, etat: 'marche' },
      { debut: debut + 10 * H, fin: debut + 11 * H, etat: 'panne', organeId: 'uv' },
      { debut: debut + 11 * H, fin: debut + 13 * H, etat: 'marche' },
    ],
  },
  alarmes: [],
  trs: {
    r1: [{ jour: debut, disponibilite: 0.75, performance: 0.9, qualite: 0.95, trs: 0.64, ouvertureMin: 480, marcheMin: 360, panneMin: 60, calageMin: 60 }],
  },
};

describe('temps d’arrêt et efficacité d’une machine', () => {
  it('sépare pannes, réglages et marche, et compte les pannes par organe', () => {
    const l = ligneMachine(histoire, m, debut, debut + DAY);

    expect(l.ouverture).toBe(8 * H);
    expect(l.panne).toBe(H);
    expect(l.calage).toBe(H);
    expect(l.nPannes).toBe(1);
    expect(l.parOrgane.get('uv')).toBe(H);
    expect(l.D).toBeCloseTo(0.75);
    expect(l.trs).toBeCloseTo(0.75 * 0.9 * 0.95);
  });

  it('n’invente pas d’efficacité pour une machine qui n’a pas été ouverte', () => {
    const l = ligneMachine(histoire, m, debut, debut + 4 * H);

    expect(l.trs).toBeUndefined();
    expect(bilan([l]).trs).toBeUndefined();
  });
});

describe('alarmes', () => {
  const alarme = (id: string, debutMin: number, dureeMin: number, regle: Alarme['regle'] = 'seuil'): Alarme => ({
    id,
    code: 'UV-06',
    message: 'Puissance UV insuffisante',
    gravite: 'critique',
    machineId: 'r1',
    organeId: 'uv',
    horodatage: debut + debutMin * 60_000,
    finLe: debut + (debutMin + dureeMin) * 60_000,
    acquitteeLe: debut + (debutMin + 2) * 60_000,
    statut: 'resolue',
    regle,
  });

  it('calcule le temps moyen de réparation et retient la plus longue', () => {
    const ba = bilanAlarmes([alarme('a', 0, 10), alarme('b', 100, 30, 'repetitif'), alarme('c', 200, 20, 'repetitif')]);

    expect(ba.mttr).toBe(20 * 60_000);
    expect(ba.plusLongue?.id).toBe('b');
    expect(ba.nRepetitifs).toBe(1);
    expect(ba.acquittement).toBe(2 * 60_000);
  });
});

describe('tenue d’une mesure', () => {
  it('ne compte que les relevés pris pendant la marche', () => {
    const serie = [
      { t: debut + 2 * H, v: 0 },
      { t: debut + 7 * H, v: 100 },
      { t: debut + 8 * H, v: 150 },
      { t: debut + 12 * H, v: 120 },
    ];

    const t = tenueMesure(serie, { attentionBas: 90, attentionHaut: 130 }, histoire, 'r1');

    expect(t.n).toBe(3);
    expect(t.part).toBeCloseTo(2 / 3);
    expect(t.creuxALArret).toBe(true);
  });
});
