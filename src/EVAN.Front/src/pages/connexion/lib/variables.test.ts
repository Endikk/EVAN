import { describe, expect, it } from 'vitest';
import { machineModel } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { autoMatch, browseVariables, nbReliees, sensVariable } from './variables';

const flexo: Machine = {
  id: 'm-test',
  batimentId: 'b',
  type: 'flexo',
  nom: 'Presse flexo',
  numero: 'R01',
  position: [0, 0],
  rotationDeg: 0,
  modele: { url: '' },
};

describe('variables d’un automate', () => {
  it('chaque variable JMF dit ce qu’elle contient', () => {
    const model = machineModel(flexo);
    const vars = browseVariables(flexo, 'jmf', model.points, model.organes);
    expect(vars.find((v) => v.nom === 'DeviceStatus')?.sens).toBe('L’état de la presse : en marche, à l’arrêt, en panne.');
    for (const v of vars) expect(v.sens.length).toBeGreaterThan(10);
  });

  it('en OPC UA, une variable par point de mesure, expliquée par sa mesure et son organe', () => {
    const model = machineModel(flexo);
    const vars = browseVariables(flexo, 'opcua', model.points, model.organes);
    expect(vars.length).toBe(model.points.length + 2);
    expect(vars[0].sens).toContain(model.points[0].libelle);
  });

  it('l’association automatique relie les variables OPC UA à leurs points', () => {
    const model = machineModel(flexo);
    const vars = browseVariables(flexo, 'opcua', model.points, model.organes);
    const assoc = autoMatch(vars, model.points, model.organes);
    expect(nbReliees(vars, assoc)).toBeGreaterThan(model.points.length / 2);
  });

  it('une association d’un autre protocole ne compte pas', () => {
    expect(nbReliees([{ id: 'a', nom: 'A', type: 'Double', sens: '' }], { b: { pointId: 'p', score: 1 } })).toBe(0);
  });

  it('variable inconnue : une phrase générale', () => {
    expect(sensVariable('Truc')).toBe('Une valeur publiée par l’automate.');
  });
});
