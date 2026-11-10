import { describe, expect, it } from 'vitest';
import cases from '@data/tests/defaut-repetitif.json';
import { MACHINE_TYPES, type NatureDefaut } from '@/domain/catalog';
import { circonference, diagnostiquerPas, pasDepuisEtiquettes } from './repeatDefect';

interface Cas {
  nom: string;
  type: string;
  pas: number;
  nature?: NatureDefaut;
  premier?: { organe: number; cylindre: string; rapport: number; confiance: string };
  memeDeveloppement?: string[];
  contient?: { cylindre: string; rapport: number }[];
  nombre?: number;
}

describe('défaut répétitif → pièce tournante', () => {
  it('calcule la circonférence depuis le diamètre ou le développement', () => {
    expect(circonference({ nom: 'r', nature: 'marque', diametre: 100 })).toBeCloseTo(314.159, 2);
    expect(circonference({ nom: 'c', nature: 'impression', developpement: 381 })).toBe(381);
    expect(pasDepuisEtiquettes(3, 110)).toBe(330);
  });

  for (const c of (cases as { cas: Cas[] }).cas) {
    it(c.nom, () => {
      const d = diagnostiquerPas(MACHINE_TYPES[c.type].organes, c.pas, { nature: c.nature });
      if (c.nombre !== undefined) expect(d.candidats).toHaveLength(c.nombre);
      if (c.premier) {
        const p = d.candidats[0];
        expect(p.organeNumero).toBe(c.premier.organe);
        expect(p.cylindre).toBe(c.premier.cylindre);
        expect(p.rapport).toBe(c.premier.rapport);
        expect(p.confiance).toBe(c.premier.confiance);
      }
      if (c.memeDeveloppement) expect(d.candidats[0].memeDeveloppement).toEqual(expect.arrayContaining(c.memeDeveloppement));
      for (const x of c.contient ?? []) expect(d.candidats.some((k) => k.cylindre === x.cylindre && k.rapport === x.rapport)).toBe(true);
    });
  }

  it('un pas nul ou négatif ne donne aucun candidat', () => {
    expect(diagnostiquerPas(MACHINE_TYPES.flexo.organes, 0).candidats).toHaveLength(0);
  });
});
