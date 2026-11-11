import { describe, expect, it } from 'vitest';
import demo from '@data/demo.json';
import type { Machine } from '@/domain/types';
import { machineModel } from '@/domain/catalog';
import { getHistory } from '@/sim/history';
import { echeances, indicateurs, journal, previsions, tendance, type Saisie } from './maintenance';

const now = Date.parse('2026-10-08T08:30:00Z');
const tours = (demo as unknown as { usines: { machines: Machine[] }[] }).usines[0].machines;
const h = getHistory(tours, now);
const r04 = tours.find((m) => m.id === 'm-r04')!;
const r01 = tours.find((m) => m.id === 'm-r01')!;

describe('carnet de maintenance', () => {
  it('repère la dérive de la lampe UV de R04, et elle seule sur les rotatives', () => {
    const p = previsions(h, r04, now);
    expect(p.map((x) => x.pointId)).toEqual(['m-r04.o5.puissance_uv']);
    expect(p[0].pente).toBeLessThan(-1);
    expect(p[0].r2).toBeGreaterThan(0.9);
    expect(p[0].franchissement).toBeGreaterThan(now);
    for (const m of tours.filter((x) => x.type === 'offset' && x.id !== 'm-r04')) expect(previsions(h, m, now)).toEqual([]);
  });

  it('suit un point d’usure comme une maintenance conditionnelle', () => {
    const outil = echeances(h, r01, now).find((e) => e.tacheId === 'outil')!;
    const point = machineModel(r01).points.find((p) => p.id === 'm-r01.o6.metres_outil')!;
    expect(outil.nature).toBe('conditionnelle');
    expect(outil.seuil).toBe(280);
    expect(outil.compteur).toBeCloseTo(tendance(h, r01, point, now)!.valeur, 9);
    expect(outil.echeance).toBeGreaterThan(now);
  });

  it('une saisie de la tâche remet son compteur à zéro', () => {
    const avant = echeances(h, r01, now).find((e) => e.tacheId === 'uv')!;
    const saisie: Saisie = { id: 's1', machineId: 'm-r01', type: 'preventive', date: now - 1000, duree: 45, titre: 'Lampes UV', auteur: 'Test', tacheId: 'uv' };
    const apres = echeances(h, r01, now, [saisie]).find((e) => e.tacheId === 'uv')!;
    expect(avant.compteur).toBeGreaterThan(0);
    expect(apres.compteur).toBeLessThan(1);
    expect(apres.statut).toBe('ok');
  });

  it('une tâche suivie par une mesure d’usure, consignée, repart de zéro à la date de la saisie', () => {
    const avant = echeances(h, r01, now).find((e) => e.tacheId === 'outil')!;
    const date = now - 2 * 3_600_000;
    const saisie: Saisie = { id: 's3', machineId: 'm-r01', type: 'preventive', date, duree: 40, titre: 'Outil de découpe changé', auteur: 'Test', tacheId: 'outil' };
    const apres = echeances(h, r01, now, [saisie]).find((e) => e.tacheId === 'outil')!;
    expect(avant.compteur).toBeGreaterThan(apres.compteur);
    expect(apres.compteur).toBeGreaterThanOrEqual(0);
    expect(apres.compteur).toBeLessThan(avant.seuil * 0.05);
    expect(apres.dernierPassage).toBe(date);
    expect(apres.statut).toBe('ok');
  });

  it('les passages du plan ne tombent plus tous à la même heure, et restent entre 6 h et 19 h 45', () => {
    const heures = tours
      .flatMap((m) => echeances(h, m, now))
      .filter((e) => e.nature === 'systematique' && e.dernierPassage !== undefined)
      .map((e) => {
        const d = new Date(e.dernierPassage!);
        return d.getHours() * 60 + d.getMinutes();
      });
    expect(new Set(heures).size).toBeGreaterThan(3);
    for (const m of heures) {
      expect(m).toBeGreaterThanOrEqual(6 * 60);
      expect(m).toBeLessThanOrEqual(19 * 60 + 45);
      expect(m % 15).toBe(0);
    }
  });

  it('le journal reprend les pannes résolues, les préventives du plan et les saisies, du plus récent au plus ancien', () => {
    const saisie: Saisie = { id: 's2', machineId: 'm-r01', type: 'observation', date: now - 60_000, duree: 5, titre: 'Bruit au rembobineur', auteur: 'Test' };
    const j = journal(h, tours, [], [saisie], now);
    expect(j.filter((i) => i.type === 'curative')).toHaveLength(h.alarmes.length);
    expect(j.some((i) => i.type === 'preventive')).toBe(true);
    expect(j[0].id).toBe('s2');
    for (let i = 1; i < j.length; i++) expect(j[i - 1].debut).toBeGreaterThanOrEqual(j[i].debut);
    expect(j.find((i) => i.type === 'curative')!.compteRendu).toBeTruthy();
  });

  it('calcule MTBF, MTTR et temps d’acquittement', () => {
    const k = indicateurs(h, tours, journal(h, tours, [], [], now), h.alarmes, h.debut, now);
    const mttr = h.alarmes.reduce((s, a) => s + (a.finLe! - a.horodatage), 0) / h.alarmes.length;
    expect(k.pannes).toBe(h.alarmes.length);
    expect(k.mttr).toBeCloseTo(mttr, 6);
    expect(k.mtta).toBeGreaterThan(30_000);
    expect(k.mtta).toBeLessThan(5 * 60_000);
    expect(k.mtbf).toBeCloseTo((k.heuresMarche * 3_600_000) / k.pannes, 3);
  });
});
