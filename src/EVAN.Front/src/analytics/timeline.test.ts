import { describe, expect, it } from 'vitest';
import demo from '@data/demo.json';
import type { Machine } from '@/domain/types';
import { getHistory } from '@/sim/history';
import { classify } from '@/sim/rules';
import { chronologie, imageA } from './timeline';

const now = Date.parse('2026-10-08T08:30:00Z');
const machines = (demo as unknown as { usines: { machines: Machine[] }[] }).usines[0].machines;
const h = getHistory(machines, now);

describe('chronologie d’une panne', () => {
  // Une panne à dérive (rampe) déjà réparée : toutes les étapes y sont.
  const alarme = h.alarmes.find((a) => a.code === 'DC-07' && a.finLe! + 10 * 60_000 < h.fin)!;
  const machine = machines.find((m) => m.id === alarme.machineId)!;
  const c = chronologie(h, machine, alarme)!;

  it('ordonne les étapes, de la dérive au retour en production', () => {
    expect(c.evenements.map((e) => e.etape)).toEqual(['derive', 'attention', 'alarme', 'acquittement', 'reparation', 'redemarrage', 'production']);
  });

  it('l’alarme tombe quand la mesure atteint le seuil, et la machine s’arrête', () => {
    const e = c.evenements.find((x) => x.etape === 'alarme')!;
    expect(e.seuil).toBe(c.point!.seuils.alarmeHaut);
    expect(imageA(c, alarme.horodatage + 1000).etat).toBe('panne');
    const avant = imageA(c, alarme.horodatage - 10 * 60_000);
    expect(classify(avant.valeurs[c.point!.id], c.point!.seuils)).toBe('ok');
  });

  it('passe en attention entre le seuil d’attention et l’alarme', () => {
    const t = c.evenements.find((x) => x.etape === 'attention')!.t;
    expect(imageA(c, t + c.pas).etat).toBe('attention');
  });

  it('limite le nombre d’images d’une longue panne', () => {
    expect(c.images.length).toBeLessThanOrEqual(721);
  });
});
