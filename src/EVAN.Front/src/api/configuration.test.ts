import { describe, expect, it } from 'vitest';
import { machineModel } from '@/domain/catalog';
import type { Connexion, Machine, Site } from '@/domain/types';
import { emptyUsine, type Usine } from '@/store/project';
import { depuisConfiguration, versConfiguration } from './configuration';

const site: Site = {
  id: 'site-dupont',
  organisationId: 'org-dupont',
  nom: 'Usine Dupont',
  adresse: '1 rue de l’Usine, Évreux',
  coordonnees: [1.15, 49.02],
  repere: { origin: [1.15, 49.02], angleDeg: 12 },
};

const machine = (id: string, type: string, url = `/kit/modeles/${type}.glb`): Machine => ({
  id,
  batimentId: 'bat-1',
  type,
  nom: type,
  numero: id.toUpperCase(),
  position: [4, 6],
  rotationDeg: 90,
  modele: { url },
  creeLe: 1_790_000_000_000,
});

const connexion = (machineId: string): Connexion => ({
  id: `cx-${machineId}`,
  machineId,
  protocole: 'modbus',
  parametres: { hote: '10.20.1.40', port: '502' },
  etat: 'connectee',
  associations: {},
  lectureSeule: true,
});

function usine(): Usine {
  const flexo = machine('m-1', 'flexo');
  const offset = machine('m-2', 'offset');
  const importee = machine('m-3', 'custom', 'blob:http://localhost/123');
  const base = machineModel(offset);
  // Seuil d'alarme abaissé sur le premier point de l'offset : une saisie à garder.
  const points = base.points.map((p, i) => (i === 0 ? { ...p, seuils: { ...p.seuils, alarmeHaut: p.nominal + 1 } } : p));
  return {
    ...emptyUsine(site.id),
    site,
    machines: [flexo, offset, importee],
    connexions: { 'm-1': connexion('m-1'), 'm-3': connexion('m-3') },
    perso: { 'm-2': { organes: base.organes, points } },
    configure: true,
  };
}

describe('configuration envoyée au serveur', () => {
  it('une usine sans adresse ne part pas', () => {
    expect(versConfiguration(emptyUsine('site-vide'))).toBeNull();
  });

  it('chaque machine porte ses organes et ses points, saisies comprises', () => {
    const c = versConfiguration(usine())!;
    const offset = machineModel(usine().machines[1], usine().perso['m-2']);

    expect(c.organes.filter((o) => o.machineId === 'm-1')).toEqual(machineModel(usine().machines[0]).organes);
    expect(c.points.filter((p) => p.machineId === 'm-2')).toEqual(offset.points);
    expect(c.configure).toBe(true);
  });

  it('une machine au modèle importé reste dans le navigateur, avec sa connexion', () => {
    const c = versConfiguration(usine())!;

    expect(c.machines.map((m) => m.id)).toEqual(['m-1', 'm-2']);
    expect(c.connexions.map((x) => x.machineId)).toEqual(['m-1']);
    expect(c.organes.some((o) => o.machineId === 'm-3')).toBe(false);
  });
});

describe('configuration relue du serveur', () => {
  it('l’usine relue est celle qui a été envoyée', () => {
    const envoyee = versConfiguration(usine())!;
    // Le serveur omet les champs vides : on le simule par un aller-retour JSON.
    const relue = depuisConfiguration(JSON.parse(JSON.stringify(envoyee)));

    expect(relue.id).toBe(site.id);
    expect(relue.machines.map((m) => m.id)).toEqual(['m-1', 'm-2']);
    expect(relue.connexions['m-1']).toEqual(connexion('m-1'));
    expect(versConfiguration(relue)).toEqual(envoyee);
  });

  it('seules les machines modifiées reviennent avec des saisies', () => {
    const relue = depuisConfiguration(JSON.parse(JSON.stringify(versConfiguration(usine())!)));

    expect(Object.keys(relue.perso)).toEqual(['m-2']);
    expect(relue.perso['m-2'].points[0].seuils.alarmeHaut).toBe(usine().perso['m-2'].points[0].seuils.alarmeHaut);
  });
});
