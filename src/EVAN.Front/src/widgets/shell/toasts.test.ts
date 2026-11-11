import { describe, expect, it } from 'vitest';
import { avisRedondant, quoiAlarme } from './Toasts';

const site = { kind: 'site' } as const;
const organe = { kind: 'organe', machineId: 'm1', organeId: 'm1.o2' } as const;

describe('avis redondant avec la fiche de la pièce', () => {
  it('se cache quand la supervision montre déjà la fiche de son alarme', () => {
    expect(avisRedondant({ alarmeId: 'a' }, { organeId: 'm1.o2', statut: 'active' }, 6, organe)).toBe(true);
  });

  it('reste visible ailleurs, sur une autre pièce, ou une fois l’alarme close', () => {
    expect(avisRedondant({ alarmeId: 'a' }, { organeId: 'm1.o2', statut: 'active' }, 7, organe)).toBe(false);
    expect(avisRedondant({ alarmeId: 'a' }, { organeId: 'm1.o2', statut: 'active' }, 6, site)).toBe(false);
    expect(avisRedondant({ alarmeId: 'a' }, { organeId: 'm1.o3', statut: 'active' }, 6, organe)).toBe(false);
    expect(avisRedondant({ alarmeId: 'a' }, { organeId: 'm1.o2', statut: 'resolue' }, 6, organe)).toBe(false);
    expect(avisRedondant({}, undefined, 6, organe)).toBe(false);
  });
});

describe('première ligne de l’avis d’une alarme', () => {
  it('dit « Dérive repérée » pour une dérive, pas « Mesure hors de sa plage »', () => {
    expect(quoiAlarme({ gravite: 'attention' }, { regle: 'derive' })).toBe('Dérive repérée');
    expect(quoiAlarme({ gravite: 'attention' }, { regle: 'seuil' })).toBe('Mesure hors de sa plage');
    expect(quoiAlarme({ gravite: 'critique' }, undefined)).toBe('Panne détectée');
  });
});
