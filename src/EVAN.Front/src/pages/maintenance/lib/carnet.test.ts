import { describe, expect, it } from 'vitest';
import type { Echeance, Prevision, Prevue } from '@/analytics/maintenance';
import {
  dureeTotale,
  fmtArret,
  grouperParUrgence,
  lignesAFaire,
  minuscule,
  quand,
  quandLigne,
  texteCompteur,
  urgence,
  urgenceDate,
  verdictMaintenance,
} from './carnet';

const JOUR = 86_400_000;
const now = Date.parse('2026-10-13T10:00:00Z');

function echeance(partiel: Partial<Echeance>): Echeance {
  return {
    id: 'm-r01:uv',
    machineId: 'm-r01',
    tacheId: 'uv',
    organeId: 'm-r01.o4',
    organeNom: 'Séchage UV et air chaud',
    tache: 'Remplacer les lampes UV',
    nature: 'systematique',
    compteur: 1623,
    seuil: 1500,
    unite: 'h',
    progression: 1623 / 1500,
    statut: 'en_retard',
    echeance: now - 11 * JOUR,
    duree: 45,
    ...partiel,
  };
}

const derive: Prevision = {
  machineId: 'm-r04',
  pointId: 'm-r04.o5.puissance_uv',
  organeId: 'm-r04.o5',
  organeNom: 'Séchage UV',
  libelle: 'Puissance UV',
  unite: '%',
  valeur: 75.5,
  pente: -1.23,
  r2: 0.95,
  seuil: 72,
  niveau: 'attention',
  franchissement: Date.parse('2026-10-16T12:00:00Z'),
};

const numero = (id: string) => id.replace('m-', '').toUpperCase();
/** Les lignes de « À faire » de quelques échéances, sans dérive ni intervention planifiée. */
const lignes = (ech: Echeance[], derives: Prevision[] = [], prevues: Prevue[] = []) => lignesAFaire({ ech, derives, prevues, now });
/** Les phrases portent une espace insécable avant « : » ; on compare le texte lu. */
const lu = (s?: string) => s?.replace(/\u00a0/g, ' ');

describe('urgence d’un entretien', () => {
  it('range en retard, cette semaine, plus tard, ou nulle part au-delà de l’horizon', () => {
    expect(urgence(echeance({}), now)).toBe('retard');
    expect(urgence(echeance({ statut: 'a_planifier', echeance: now + 3 * JOUR }), now)).toBe('semaine');
    expect(urgence(echeance({ statut: 'a_planifier', echeance: now + 12 * JOUR }), now)).toBe('plus-tard');
    expect(urgence(echeance({ statut: 'ok', echeance: now + 20 * JOUR }), now)).toBe('plus-tard');
    expect(urgence(echeance({ statut: 'ok', echeance: now + 60 * JOUR }), now)).toBeNull();
  });

  it('met le retard le plus ancien en tête', () => {
    const g = grouperParUrgence(lignes([echeance({ id: 'a', echeance: now - 2 * JOUR }), echeance({ id: 'b', echeance: now - 11 * JOUR })]), now);
    expect(g.retard.map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('phrases', () => {
  it('dit quand faire l’entretien sans abréviation', () => {
    expect(quand(echeance({}), now)).toBe('dépassé de 11 jours');
    expect(quand(echeance({ echeance: now + 3 * JOUR }), now)).toBe('dans 3 jours');
    expect(quand(echeance({ echeance: now + JOUR }), now)).toBe('demain');
  });

  it('dit ce que mesure la barre', () => {
    expect(texteCompteur(echeance({ compteur: 216, seuil: 200 }))).toBe('216 h de marche sur 200 h prévues');
    expect(texteCompteur(echeance({ unite: 'j', compteur: 20.4, seuil: 21 }))).toBe('20 jours sur 21 prévus');
  });

  it('garde la majuscule des sigles', () => {
    expect(minuscule('Remplacer les lampes UV')).toBe('remplacer les lampes UV');
    expect(minuscule('UV à contrôler')).toBe('UV à contrôler');
  });
});

describe('phrase du haut', () => {
  it('nomme l’entretien le plus en retard, et passe au problème après une semaine', () => {
    const g = grouperParUrgence(lignes([echeance({}), echeance({ id: 'x', tache: 'Contrôler le frein', echeance: now - 4 * JOUR })]), now);
    const v = verdictMaintenance({ groupes: g, previsions: [derive], numero, now });
    expect(lu(v.verdict)).toBe('2 entretiens en retard, à commencer par remplacer les lampes UV de R01.');
    expect(v.ton).toBe('crit');
    expect(lu(v.suite)).toBe('Une mesure dérive : puissance UV de R04.');
  });

  it('reste à surveiller pour un petit retard', () => {
    const g = grouperParUrgence(lignes([echeance({ echeance: now - 2 * JOUR })]), now);
    const v = verdictMaintenance({ groupes: g, previsions: [], numero, now });
    expect(lu(v.verdict)).toBe('1 entretien en retard : remplacer les lampes UV de R01.');
    expect(v.ton).toBe('warn');
  });

  it('parle d’une seule machine quand elle est choisie', () => {
    const g = grouperParUrgence(lignes([echeance({ statut: 'a_planifier', echeance: now + 3 * JOUR })]), now);
    const v = verdictMaintenance({ groupes: g, previsions: [], numero, now, machine: 'R01' });
    expect(lu(v.verdict)).toBe('Sur R01, aucun entretien en retard, le prochain dans 3 jours : remplacer les lampes UV.');
    expect(v.ton).toBe('ok');
  });

  it('dit que tout est à jour', () => {
    const v = verdictMaintenance({ groupes: grouperParUrgence([], now), previsions: [], numero, now });
    expect(v).toEqual({ verdict: 'Tous les entretiens sont à jour.', ton: 'ok', suite: 'Rien n’est prévu dans les sept prochains jours.' });
  });
});

/** La lampe UV de R04 : à jour au plan (91 jours), sur le même organe que la puissance UV qui dérive. */
const lampeR04 = (partiel: Partial<Echeance> = {}) =>
  echeance({
    id: 'm-r04:uv',
    machineId: 'm-r04',
    tacheId: 'uv',
    organeId: 'm-r04.o5',
    organeNom: 'Séchage UV',
    tache: 'Remplacer la lampe UV',
    statut: 'ok',
    compteur: 200,
    seuil: 1500,
    progression: 200 / 1500,
    echeance: now + 91 * JOUR,
    ...partiel,
  });

describe('une dérive dans « À faire »', () => {
  it('avance la tâche du plan sur le même organe : à faire cette semaine, au jour du seuil', () => {
    const [l] = lignes([lampeR04()], [derive]);
    expect(l.derive?.pointId).toBe(derive.pointId);
    expect(l.urgence).toBe('semaine');
    expect(l.date).toBe(derive.franchissement);
    expect(quandLigne(l, now)).toBe('seuil dans 3 jours');
  });

  it('fait sa propre ligne quand aucune tâche du plan ne touche son organe', () => {
    const l = lignes([], [derive]);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: `derive:${derive.pointId}`, tache: 'Puissance UV en dérive', urgence: 'semaine', organeNom: 'Séchage UV' });
  });

  it('reste hors de la semaine quand le seuil est loin', () => {
    expect(urgenceDate(now + 12 * JOUR, now)).toBe('plus-tard');
    expect(urgenceDate(now + 45 * JOUR, now)).toBeNull();
  });
});

describe('une intervention planifiée', () => {
  const prevue = (partiel: Partial<Prevue> = {}): Prevue => ({
    id: 'pv1',
    machineId: 'm-r04',
    organeId: 'm-r04.o5',
    tacheId: 'uv',
    titre: 'Remplacer la lampe UV',
    date: Date.parse('2026-10-14T11:00:00Z'),
    duree: 45,
    pointId: derive.pointId,
    ...partiel,
  });

  it('se range à son jour, sur la ligne de sa tâche, avec son heure', () => {
    const l = lignes([lampeR04()], [derive], [prevue()]);
    expect(l).toHaveLength(1);
    expect(l[0].prevue?.id).toBe('pv1');
    expect(l[0].urgence).toBe('semaine');
    expect(quandLigne(l[0], now)).toBe('prévue demain à 13:00');
  });

  it('passe en retard, à consigner, une fois son jour passé', () => {
    const [l] = lignes([lampeR04()], [], [prevue({ date: now - 2 * JOUR })]);
    expect(l.urgence).toBe('retard');
    expect(quandLigne(l, now)).toMatch(/^prévue .*, à consigner$/);
  });

  it('garde le retard d’une tâche déjà dépassée, même planifiée plus tard', () => {
    const [l] = lignes([echeance({})], [], [prevue({ machineId: 'm-r01', tacheId: 'uv', date: now + 2 * JOUR })]);
    expect(l.urgence).toBe('retard');
  });

  it('fait sa propre ligne quand elle ne réalise aucune tâche', () => {
    const l = lignesAFaire({ ech: [], derives: [], prevues: [prevue({ tacheId: undefined, pointId: undefined, titre: 'Contrôle du moteur' })], now, nomOrgane: () => 'Séchage UV' });
    expect(l[0]).toMatchObject({ id: 'pv1', tache: 'Contrôle du moteur', organeNom: 'Séchage UV', urgence: 'semaine' });
  });
});

describe('temps d’arrêt', () => {
  it('additionne les durées d’un rang et les dit en heures et minutes', () => {
    const g = grouperParUrgence(lignes([echeance({ duree: 45 }), echeance({ id: 'b', duree: 50, echeance: now - 3 * JOUR })]), now);
    expect(dureeTotale(g.retard)).toBe(95);
    expect(fmtArret(95)).toBe('1 h 35');
    expect(fmtArret(45)).toBe('45 min');
    expect(fmtArret(120)).toBe('2 h');
  });
});
