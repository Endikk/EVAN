/**
 * Historique simulé : cas qui ne passent pas par le contrat front / back (machines posées pendant la session).
 */
import { describe, expect, it } from 'vitest';
import type { Machine } from '@/domain/types';
import { machineModel } from '@/domain/catalog';
import { debutDePoste, getHistory, historicValue, H } from './history';

const machine = (id: string, type: string, p: Partial<Machine> = {}): Machine => ({
  id,
  batimentId: 'b',
  type,
  nom: id,
  numero: id.toUpperCase(),
  position: [0, 0],
  rotationDeg: 0,
  modele: { url: '' },
  ...p,
});

const MAINTENANT = Date.parse('2026-10-08T08:30:00Z');

describe('historique simulé', () => {
  it('ne plante pas quand la seule flexo vient d’être posée (pas encore d’historique)', () => {
    // Usine sans flexo d'origine (Crissey), où l'on vient de poser une presse flexo dans l'assistant.
    const machines = [machine('m-offset', 'offset'), machine('m-flexo-neuve', 'flexo', { creeLe: MAINTENANT - 60_000 })];
    const h = getHistory(machines, MAINTENANT);
    expect(h.periodes['m-flexo-neuve']).toBeUndefined();
    expect(h.alarmes.every((a) => a.machineId !== 'm-flexo-neuve')).toBe(true);
  });

  it('écrit le défaut répétitif sur la flexo d’origine, pas sur celle posée pendant la session', () => {
    const machines = [machine('m-flexo-neuve', 'flexo', { creeLe: MAINTENANT - 60_000 }), machine('m-flexo', 'flexo')];
    const h = getHistory(machines, MAINTENANT + 7 * H);
    const repetees = h.alarmes.filter((a) => a.machineId === 'm-flexo' && a.code === h.alarmes.find((x) => x.machineId === 'm-flexo')?.code);
    expect(repetees.length).toBeGreaterThan(0);
    expect(h.alarmes.some((a) => a.machineId === 'm-flexo-neuve')).toBe(false);
  });

  it('deux machines du même type n’ont pas la même usure', () => {
    const machines = [machine('m-offset-a', 'offset'), machine('m-offset-b', 'offset')];
    const h = getHistory(machines, MAINTENANT);
    const usures = machines.map((m) => {
      const model = machineModel(m);
      const p = model.points.find((x) => x.cle === 'heures_blanchet')!;
      const def = model.defs[p.organeId];
      return historicValue(h, m, p, def.mesures.find((x) => x.cle === p.cle)!, def.panne, h.fin);
    });
    expect(usures[0]).not.toBe(usures[1]);
    // À 30 % près du nominal du catalogue (610 h).
    for (const u of usures) {
      expect(u).toBeGreaterThanOrEqual(610 * 0.7);
      expect(u).toBeLessThanOrEqual(610 * 1.3);
    }
  });
});

describe('début de poste', () => {
  const local = (iso: string) => new Date(iso).getTime();

  it('prend 5 h le matin et 13 h l’après-midi', () => {
    expect(debutDePoste(local('2026-10-08T09:40:00'))).toBe(local('2026-10-08T05:00:00'));
    expect(debutDePoste(local('2026-10-08T16:10:00'))).toBe(local('2026-10-08T13:00:00'));
  });

  it('avant 5 h, garde le poste d’après-midi de la veille', () => {
    expect(debutDePoste(local('2026-10-08T03:00:00'))).toBe(local('2026-10-07T13:00:00'));
  });
});
