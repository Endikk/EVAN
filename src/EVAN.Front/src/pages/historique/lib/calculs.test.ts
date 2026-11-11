import { describe, expect, it } from 'vitest';
import type { Alarme, Machine } from '@/domain/types';
import { DAY, H, type History } from '@/sim/history';
import { bilan, bilanAlarmes, critiquesParTranche, ligneMachine, pannesParOrgane, pannesRecurrentes, tenueMesure } from './calculs';
import type { MachineModel } from '@/domain/catalog';

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
    expect(l.nCalages).toBe(1);
    expect(bilan([l]).nCalages).toBe(1);
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

describe('pannes par organe', () => {
  it('dit sur quelles machines tombe un organe regroupé par type, de la plus touchée à la moins touchée', () => {
    const m2: Machine = { ...m, id: 'r2', numero: 'R02' };
    const modele = { type: { libelle: 'Presse flexo' }, organes: [{ id: 'uv', numero: 3, nom: 'Séchage UV' }] } as unknown as MachineModel;
    const ligne = (mm: Machine, ms: number) => ({ ...ligneMachine(histoire, m, debut, debut + DAY), m: mm, parOrgane: new Map([['uv', ms]]) });

    const [uv] = pannesParOrgane([ligne(m, H), ligne(m2, 2 * H)], new Map([['r1', modele], ['r2', modele]]), false);

    expect(uv.ms).toBe(3 * H);
    expect(uv.machines).toEqual([
      { numero: 'R02', ms: 2 * H },
      { numero: 'R01', ms: H },
    ]);
  });
});

describe('alarmes dans le temps', () => {
  const critique = (id: string, t: number, code = 'UV-06'): Alarme => ({
    id,
    code,
    message: 'Puissance UV insuffisante',
    gravite: 'critique',
    machineId: 'r1',
    organeId: 'uv',
    horodatage: t,
    finLe: t + 10 * 60_000,
    statut: 'resolue',
    regle: 'seuil',
  });

  it('ne garde que les pannes revenues au moins deux fois', () => {
    const p = pannesRecurrentes([critique('a', debut), critique('b', debut + H), critique('c', debut + 2 * H, 'DC-07')], [m], debut + DAY);

    expect(p.map((x) => [x.code, x.n])).toEqual([['UV-06', 2]]);
  });

  it('compte sur 24 heures par tranches de 4 heures calées sur l’horloge, la première partant du début de la fenêtre', () => {
    // De 12 h 30 un jour à 12 h 30 le lendemain (heure de Paris).
    const from = new Date(2026, 10, 9, 12, 30).getTime();
    const now = from + DAY;
    const alarmes = [critique('a', from + 10 * 60_000), critique('b', new Date(2026, 10, 9, 17, 0).getTime()), critique('c', from - H)];

    const tranches = critiquesParTranche(alarmes, '24h', from, now);

    expect(tranches.map((x) => new Date(x.t).getHours())).toEqual([12, 16, 20, 0, 4, 8, 12]);
    expect(tranches[0].t).toBe(from);
    expect(tranches[tranches.length - 1].fin).toBe(now);
    expect(tranches.map((x) => x.v)).toEqual([1, 1, 0, 0, 0, 0, 0]);
  });

  it('compte sur 7 jours de minuit à minuit', () => {
    const lundi = new Date(2026, 10, 9).getTime();

    const jours = critiquesParTranche([critique('a', lundi + 3 * H)], '7j', lundi, lundi + 2 * DAY - H);

    expect(jours).toHaveLength(2);
    expect(jours[0]).toEqual({ t: lundi, fin: lundi + DAY, v: 1 });
  });
});
