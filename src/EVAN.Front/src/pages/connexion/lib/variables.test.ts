import { describe, expect, it } from 'vitest';
import { MACHINE_TYPES, machineModel } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { associationsDeDepart, autoMatch, browseVariables, motsEnMajuscules, nbReliees, sensVariable } from './variables';

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

  it('nomme l’organe d’une variable un mot par majuscule, lisible comme un mnémonique d’automate', () => {
    expect(motsEnMajuscules('Dérouleur et guide-bande')).toBe('DerouleurEtGuideBande');
    expect(motsEnMajuscules('Têtes jet d’encre')).toBe('TetesJetEncre');
    expect(motsEnMajuscules('Imprimante et encodeur RFID')).toBe('ImprimanteEtEncodeurRFID');
    const model = machineModel(flexo);
    const vars = browseVariables(flexo, 'opcua', model.points, model.organes);
    expect(vars[0].nom).toBe('DerouleurEtGuideBande.Tension');
  });

  it('l’association automatique relie chaque variable OPC UA à son propre point, sur toutes les machines du kit', () => {
    for (const type of Object.keys(MACHINE_TYPES)) {
      const m = { ...flexo, type } as Machine;
      const model = machineModel(m);
      const vars = browseVariables(m, 'opcua', model.points, model.organes);
      const assoc = autoMatch(vars, model.points, model.organes);
      model.points.forEach((p, i) => expect(assoc[vars[i].id]?.pointId, `${type} : ${vars[i].nom}`).toBe(p.id));
    }
  });

  it('reprend les associations enregistrées, ou propose l’automatique si elles portent sur d’anciens noms', () => {
    const model = machineModel(flexo);
    const vars = browseVariables(flexo, 'opcua', model.points, model.organes);
    const auto = () => autoMatch(vars, model.points, model.organes);
    const gardees = associationsDeDepart(vars, { [vars[0].id]: model.points[0].id }, auto);
    expect(nbReliees(vars, gardees)).toBe(1);
    const anciennes = associationsDeDepart(vars, { 'ns=2;s=R01.Derouleuretguidebande.Tension': model.points[0].id }, auto);
    expect(nbReliees(vars, anciennes)).toBe(model.points.length);
  });
});
