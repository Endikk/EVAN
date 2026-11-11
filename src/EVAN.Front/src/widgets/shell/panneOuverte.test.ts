import { describe, expect, it } from 'vitest';
import type { Alarme } from '@/domain/types';
import { panneOuverte } from './panneOuverte';

const alarme = (id: string, p: Partial<Alarme> = {}): Alarme => ({
  id,
  code: 'EM-01',
  message: 'Tension hors limite',
  gravite: 'critique',
  machineId: 'm1',
  organeId: 'm1.o1',
  horodatage: 1000,
  statut: 'active',
  regle: 'seuil',
  ...p,
});
const machines = [
  { id: 'm1', numero: 'R01' },
  { id: 'm2', numero: 'R02' },
];

describe('panne ouverte', () => {
  it('ne dit rien sans alarme critique ouverte', () => {
    expect(panneOuverte([], machines)).toBeUndefined();
    expect(panneOuverte([alarme('a', { gravite: 'attention' }), alarme('b', { statut: 'resolue' })], machines)).toBeUndefined();
  });

  it('nomme la machine de la panne, et la garde tant qu’elle est prise en charge sans être close', () => {
    const p = panneOuverte([alarme('a', { statut: 'acquittee' })], machines);
    expect(p?.libelle).toBe('Panne sur R01');
    expect(p?.alarme.id).toBe('a');
  });

  it('compte les pannes et montre la plus récente', () => {
    const p = panneOuverte([alarme('a', { horodatage: 1000 }), alarme('b', { machineId: 'm2', horodatage: 2000 })], machines);
    expect(p?.libelle).toBe('2 pannes en cours');
    expect(p?.alarme.id).toBe('b');
  });

  it('dit qu’une panne d’exercice en est une', () => {
    const p = panneOuverte([alarme('a', { exercice: true })], machines);
    expect(p?.libelle).toBe('Panne d’exercice sur R01');
    expect(p?.exercice).toBe(true);
  });
});
