import { describe, expect, it } from 'vitest';
import type { ArretLong, EtatMachines } from './donnees';
import {
  ecartsParType,
  leconArrets,
  leconComparables,
  leconEfficacite,
  leconPlan,
  deNom,
  fr,
  listeFr,
  minuscule,
  motEfficacite,
  motEtat,
  motPannesOrganisation,
  phraseEtat,
  repartitionRetards,
  pointAttention,
  verdictOrganisation,
  type PointAttention,
} from './lecture';

const etat = (e: Partial<EtatMachines>): EtatMachines => ({ total: 14, produisent: 12, reglage: 0, panne: [], surveiller: [], ...e });
const OK: PointAttention = { ton: 'ok', titre: 'Rien à signaler' };

describe('petits mots', () => {
  it('énumère à la française', () => {
    expect(listeFr(['R03'])).toBe('R03');
    expect(listeFr(['R03', 'R05'])).toBe('R03 et R05');
    expect(listeFr(['R03', 'R05', 'R07'])).toBe('R03, R05 et R07');
  });

  it('colle les deux-points et les unités à ce qui les précède', () => {
    expect(fr('Tours : 4 entretiens, 3,6 h, 74 %')).toBe('Tours\u00a0: 4 entretiens, 3,6\u00a0h, 74\u00a0%');
  });

  it('élide « de » devant une voyelle', () => {
    expect(deNom('Orléans')).toBe('d’Orléans');
    expect(deNom('Crissey')).toBe('de Crissey');
    expect(deNom('Tours')).toBe('de Tours');
  });

  it('met une minuscule sauf devant un sigle', () => {
    expect(minuscule('Remplacer les lampes')).toBe('remplacer les lampes');
    expect(minuscule('UV hors plage')).toBe('UV hors plage');
    expect(minuscule('R01 est en panne')).toBe('R01 est en panne');
    expect(minuscule('Échenillage')).toBe('échenillage');
  });

  it('dit l’efficacité avec un mot, 85 % pour une usine de pointe', () => {
    expect(motEfficacite(0.9)).toEqual({ mot: 'Excellent', ton: 'ok' });
    expect(motEfficacite(0.74).mot).toBe('Correct');
    expect(motEfficacite(0.5).ton).toBe('warn');
  });
});

describe('état des machines en une phrase', () => {
  it('compte les machines qui produisent, sans panne', () => {
    expect(phraseEtat(etat({}), true)).toBe('12 machines sur 14 produisent, aucune panne.');
  });

  it('nomme les machines en panne', () => {
    expect(phraseEtat(etat({ produisent: 11, panne: ['R03'] }), true)).toBe('11 machines sur 14 produisent ; R03 est en panne.');
  });

  it('dit l’état en quelques mots, les pannes à part', () => {
    expect(motEtat(etat({}), true)).toEqual({ mot: '12 sur 14 produisent' });
    expect(motEtat(etat({ produisent: 11, panne: ['R03'] }), false)).toEqual({ mot: '11 sur 14 produisaient', panne: 'R03 était en panne' });
    expect(motEtat(etat({ produisent: 11, panne: ['R04'] }), false, '12 h').panne).toBe('R04 était en panne à 12 h');
    expect(motEtat(etat({ produisent: 0, panne: ['R01', 'R02', 'R03'] }), true)).toEqual({ mot: 'Aucune ne produit', panne: '3 en panne' });
    expect(motEtat(etat({ total: 0 }), true).mot).toBe('Aucune machine suivie');
  });

  it('parle au passé pour un relevé de l’historique', () => {
    expect(phraseEtat(etat({ total: 8, produisent: 8 }), false)).toBe('Les 8 machines produisaient, aucune panne.');
    expect(phraseEtat(etat({ total: 8, produisent: 0 }), false)).toBe('Aucune machine ne produisait, aucune panne.');
  });
});

describe('point qui demande de l’attention', () => {
  it('met une panne en cours avant tout le reste', () => {
    const p = pointAttention({ direct: etat({ panne: ['R03'] }), alarme: 'Conductivité hors plage', retard: 4, derives: 1 });
    expect(p).toMatchObject({ ton: 'crit', titre: 'R03 est en panne', action: 'supervision', detailVisible: true });
    expect(p.detail).toBe('Alarme : conductivité hors plage.');
  });

  it('cite l’entretien le plus urgent', () => {
    const p = pointAttention({ retard: 4, urgent: { tache: 'Remplacer les lampes UV', organe: 'Séchage UV', numero: 'R01' }, derives: 0 });
    expect(p.titre).toBe('4 entretiens en retard');
    expect(p.detail).toBe('Le plus urgent : remplacer les lampes UV, sur R01.');
    expect(p.detailVisible).toBeFalsy();
  });

  it('dit quand rien ne demande d’attention', () => {
    expect(pointAttention({ retard: 0, derives: 0 })).toEqual({ ton: 'ok', titre: 'Rien à signaler' });
  });
});

describe('verdict de l’organisation', () => {
  it('nomme l’usine qui demande de l’attention, avec le ton de son problème', () => {
    const v = verdictOrganisation([
      { court: 'Tours', tourne: true, point: { ton: 'warn', titre: '4 entretiens en retard', detail: 'Le plus urgent : x.' } },
      { court: 'Crissey', tourne: true, point: OK },
    ]);
    expect(v.verdict).toBe('Vos 2 usines tournent. Tours demande de l’attention : 4 entretiens en retard.');
    expect(v.ton).toBe('warn');
    // Le détail est sur la carte de l'usine, juste dessous : la phrase du haut ne le répète pas.
    expect(v.suite).toBeUndefined();
  });

  it('est rassurant quand tout va bien', () => {
    const v = verdictOrganisation([
      { court: 'Tours', tourne: true, point: OK },
      { court: 'Crissey', tourne: false, point: OK },
    ]);
    expect(v.verdict).toBe('Tours tourne, Crissey est à l’arrêt. Rien ne demande d’attention.');
    expect(v.ton).toBe('ok');
  });

  it('dit au passé l’état d’une usine connue seulement par son dernier relevé', () => {
    const v = verdictOrganisation([
      { court: 'Tours', tourne: true, point: OK },
      { court: 'Crissey', tourne: true, point: OK, releve: true },
    ]);
    expect(v.verdict).toBe('Tours tourne, Crissey tournait au dernier relevé. Rien ne demande d’attention.');
    const seule = verdictOrganisation([{ court: 'Crissey', tourne: false, point: OK, releve: true }]);
    expect(seule.verdict).toBe('Crissey était à l’arrêt au dernier relevé. Rien ne demande d’attention.');
  });

  it('prend le ton de la pire usine quand plusieurs demandent de l’attention', () => {
    const v = verdictOrganisation([
      { court: 'Tours', tourne: true, point: { ton: 'warn', titre: '4 entretiens en retard' } },
      { court: 'Crissey', tourne: true, point: { ton: 'crit', titre: 'R02 est en panne' } },
    ]);
    expect(v.ton).toBe('crit');
    expect(v.verdict).toBe('Vos 2 usines tournent. Crissey et Tours demandent de l’attention.');
  });
});

describe('leçons des graphiques', () => {
  it('compare les usines jour par jour et repère la plus régulière', () => {
    const l = leconEfficacite([
      { court: 'Tours', jours: [{ trs: 0.7 }, { trs: 0.78 }, { trs: 0.72 }] },
      { court: 'Crissey', jours: [{ trs: 0.73 }, { trs: 0.74 }, { trs: 0.735 }] },
    ]);
    expect(l).toBe('Les deux usines se valent : 73 % et 74 % en moyenne. Crissey a été plus régulière.');
    expect(l.length).toBeLessThanOrEqual(90);
  });

  it('dit l’usine qui concentre les pannes, sinon la plus coûteuse', () => {
    const a = (court: string, heures: number): ArretLong => ({ id: `${court}${heures}`, message: 'Conductivité hors plage', numero: 'R06', machineNom: '', court, couleur: '', heures, fois: 3 });
    expect(leconArrets([a('Tours', 1.6), a('Tours', 1.2), a('Tours', 1.1), a('Crissey', 1)], 2)).toBe('3 sur 4 sont à Tours.');
    expect(leconArrets([a('Tours', 1.6), a('Tours', 1.2)], 2)).toBe('Toutes sont à Tours.');
    expect(leconArrets([a('Tours', 1.6), a('Crissey', 1.2)], 2)).toBe('La plus coûteuse : conductivité hors plage sur R06 à Tours, 1,6 h en 3 fois.');
    expect(leconArrets([a('Tours', 1.6)], 1)).toBe('La plus coûteuse : conductivité hors plage sur R06, 1,6 h en 3 fois.');
  });

  it('trouve le plus grand écart entre mêmes machines', () => {
    const ecarts = ecartsParType([
      { type: 'slitter', libelle: 'Refendeuse', usines: { a: { machines: 1, trs: 0.7 }, b: { machines: 1, trs: 0.76 } } },
      { type: 'flexo', libelle: 'Presse flexo', usines: { a: { machines: 1, trs: 0.74 }, b: undefined } },
    ]);
    expect(ecarts).toHaveLength(1);
    expect(leconComparables(ecarts, { a: 'Tours', b: 'Crissey' })).toBe('Plus grand écart : refendeuse, 76 % à Crissey contre 70 % à Tours.');
  });

  it('dit comment lire le plan', () => {
    expect(leconPlan({ numero: 'R07', heures: 3.6 })).toBe('R07 a perdu le plus de temps : 3,6 h.');
    expect(leconPlan(undefined)).toContain('Aucune panne');
  });

  it('dit où sont les entretiens en retard', () => {
    expect(repartitionRetards([{ court: 'Tours', retard: 4 }, { court: 'Crissey', retard: 0 }])).toBe('Tous à Tours.');
    expect(repartitionRetards([{ court: 'Tours', retard: 3 }, { court: 'Crissey', retard: 1 }])).toBe('3 à Tours et 1 à Crissey.');
  });

  it('ne répète pas deux fois la même moyenne', () => {
    expect(leconEfficacite([
      { court: 'Tours', jours: [{ trs: 0.74 }, { trs: 0.741 }] },
      { court: 'Crissey', jours: [{ trs: 0.738 }, { trs: 0.742 }] },
    ])).toBe('Les deux usines se valent : 74 % en moyenne chacune.');
  });

  it('dit où se perd le temps en pannes, rapporté au nombre de machines', () => {
    expect(motPannesOrganisation([
      { court: 'Tours', heures: 23.7, machines: 14 },
      { court: 'Crissey', heures: 8.4, machines: 8 },
    ])?.mot).toBe('Surtout à Tours');
  });
});
