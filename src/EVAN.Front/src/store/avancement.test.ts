import { describe, expect, it } from 'vitest';
import type { Batiment, Connexion, Machine, Site, Zone } from '@/domain/types';
import { etatEtapes, tachesConfig, type EntreeAvancement } from './avancement';

const site = { id: 's', organisationId: 'o', nom: 'Tours', adresse: 'Tours', coordonnees: [0, 0], repere: { origin: [0, 0], angleDeg: 0 } } as Site;
const batiment = { id: 'b1', siteId: 's', nom: 'Bâtiment A', contour: [], sigmas: [], hauteur: 8, niveaux: 1, source: 'manuel' } as unknown as Batiment;
const zone = { id: 'z1', batimentId: 'b1', nom: 'Atelier', type: 'atelier', polygone: [] } as unknown as Zone;
const machine = (id: string, numero: string): Machine => ({ id, batimentId: 'b1', type: 'flexo', nom: 'Presse', numero, position: [0, 0], rotationDeg: 0, modele: { url: '' } });
const branchee = (machineId: string): Connexion => ({ id: `cx-${machineId}`, machineId, protocole: 'opcua', parametres: {}, etat: 'connectee', associations: {}, lectureSeule: true });

const vide: EntreeAvancement = {
  mode: 'assistant',
  site: null,
  batiments: [],
  zones: [],
  machines: [],
  connexions: {},
  perso: {},
  configure: false,
  contoursVerifies: [],
  hauteursVerifiees: [],
  organesCoches: undefined,
};

describe('avancement de la configuration', () => {
  it('une étape dépassée sans être finie n’est pas cochée : elle est à reprendre', () => {
    const e = etatEtapes(tachesConfig(vide), 3);
    expect(e[1]).toBe('a-reprendre');
    expect(e[2]).toBe('a-reprendre');
    expect(e[3]).toBe('a-faire');
    expect(e[5]).toBe('a-faire');
  });

  it('une étape commencée est à reprendre, une étape dont tout l’obligatoire est fait est faite', () => {
    const entree = { ...vide, site, batiments: [batiment] };
    expect(etatEtapes(tachesConfig(entree), 1)[1]).toBe('a-reprendre');
    expect(etatEtapes(tachesConfig({ ...entree, contoursVerifies: ['b1'] }), 1)[1]).toBe('faite');
  });

  it('la connexion n’est faite qu’avec toutes les machines branchées, pas dès la première', () => {
    const entree = { ...vide, site, batiments: [batiment], zones: [zone], machines: [machine('m1', 'R01'), machine('m2', 'R02')] };
    expect(tachesConfig({ ...entree, connexions: { m1: branchee('m1') } })[5].branchees).toBe(false);
    expect(tachesConfig({ ...entree, connexions: { m1: branchee('m1'), m2: branchee('m2') } })[5].branchees).toBe(true);
  });

  it('les machines ne sont faites qu’avec des numéros uniques', () => {
    const entree = { ...vide, machines: [machine('m1', 'R01'), machine('m2', 'R01')] };
    expect(tachesConfig(entree)[3]).toEqual({ posees: true, numeros: false });
  });

  it('l’usine d’exemple a ses contours et ses hauteurs déjà vérifiés', () => {
    const t = tachesConfig({ ...vide, mode: 'demo', site, batiments: [batiment], zones: [zone] });
    expect(t[1].contours && t[2].hauteurs).toBe(true);
  });

  it('une usine configurée compte ses organes comme vérifiés tant que personne n’a rien décoché', () => {
    const entree = { ...vide, configure: true, machines: [machine('m1', 'R01')] };
    expect(tachesConfig(entree)[4].organesVerifies).toBe(true);
    expect(tachesConfig({ ...entree, organesCoches: [] })[4].organesVerifies).toBe(false);
  });

  it('une tâche qui ne se pose pas (aucune machine importée) ne fait pas passer l’étape pour commencée', () => {
    const entree = { ...vide, site, batiments: [batiment], machines: [machine('m1', 'R01')] };
    expect(tachesConfig(entree)[4].importeesDecrites).toBeUndefined();
    expect(etatEtapes(tachesConfig(entree), 3)[4]).toBe('a-faire');
  });
});
