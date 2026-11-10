import { beforeEach, describe, expect, it } from 'vitest';
import type { Machine } from '@/domain/types';
import { useProject } from './project';
import { useUi } from './ui';
import { choisirNiveau, niveauActif } from './niveau';

const machine = (id: string, niveau?: number): Machine => ({
  id,
  batimentId: 'bat-a',
  type: 'flexo',
  nom: 'Presse',
  numero: id,
  position: [5, 5],
  rotationDeg: 0,
  modele: { url: '/kit/modeles/flexo.glb' },
  ...(niveau === undefined ? {} : { niveau }),
});

describe('niveau affiché', () => {
  beforeEach(() => {
    useProject.getState().loadDemo();
    const p = useProject.getState();
    p.setNiveaux(p.batiments[0].id, 3);
    p.addMachine(machine('m-rdc'));
    p.addMachine(machine('m-etage', 2));
    useUi.setState({ niveau: 0, selectedMachineId: undefined, selectedZoneId: undefined, focus: { kind: 'site' } });
  });

  it('sélectionner une machine de l’étage y amène la scène', () => {
    useUi.getState().selectMachine('m-etage');
    expect(niveauActif()).toBe(2);
  });

  it('la caméra qui va chercher une machine amène aussi son niveau', () => {
    useUi.getState().setFocus({ kind: 'machine', machineId: 'm-etage' });
    expect(niveauActif()).toBe(2);
  });

  it('changer de niveau lâche la machine restée ailleurs', () => {
    useUi.getState().selectMachine('m-etage');
    choisirNiveau(0);
    expect(useUi.getState().selectedMachineId).toBeUndefined();
    useUi.getState().selectMachine('m-rdc');
    choisirNiveau(0);
    expect(useUi.getState().selectedMachineId).toBe('m-rdc');
  });

  it('le niveau affiché reste dans ceux de l’usine, et une autre usine s’ouvre au rez-de-chaussée', () => {
    useUi.getState().setNiveau(9);
    expect(niveauActif()).toBe(2);
    useProject.getState().switchUsine('site-crissey');
    expect(useUi.getState().niveau).toBe(0);
  });
});
