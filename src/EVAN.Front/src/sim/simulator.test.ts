/**
 * Simulateur du navigateur : ce qui suit « Intervention terminée ». La machine réparée ne relève pas d'alarme pendant
 * que ses mesures reviennent à la normale, et une clôture faite trop tôt s'annule dans les secondes qui suivent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import demo from '@data/demo.json';
import type { Machine } from '@/domain/types';
import { useProject } from '@/store/project';
import { useLive } from '@/store/live';
import { machineModel } from '@/domain/catalog';
import { getHistory, H, MIN, niveauUsure } from './history';
import { LocalSimulator, productionDuPoste } from './simulator';

const machines = (demo as unknown as { usines: { machines: Machine[] }[] }).usines[0].machines;
const R02 = machines.find((m) => m.numero === 'R02')!;

/** Fait tourner la simulation seconde par seconde (horloge simulée). */
function avancer(sim: LocalSimulator, secondes: number) {
  const pas = sim as unknown as { step(now: number): void };
  for (let i = 0; i < secondes; i++) {
    vi.advanceTimersByTime(1000);
    pas.step(Date.now());
  }
}

const ouvertes = (machineId: string) => useLive.getState().alarms.filter((a) => a.machineId === machineId && a.statut !== 'resolue');

/** Panne simulée sur R02, jusqu'à l'alarme critique. */
async function panne(sim: LocalSimulator) {
  await sim.injectFault(R02.id);
  for (let i = 0; i < 120 && !ouvertes(R02.id).some((a) => a.gravite === 'critique'); i++) avancer(sim, 1);
  const a = ouvertes(R02.id).find((x) => x.gravite === 'critique');
  expect(a).toBeDefined();
  return a!;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-10-07T09:00:00Z'));
  vi.stubGlobal('window', globalThis);
  useProject.setState({ machines, perso: {}, connexions: {} });
  useLive.setState({ alarms: [], events: [], toasts: [], trace: undefined, machines: {} });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('après « Intervention terminée »', () => {
  it('ne relève aucune alarme sur la machine réparée pendant que ses mesures reviennent', async () => {
    const sim = new LocalSimulator();
    sim.sync();
    const a = await panne(sim);
    await sim.resolve(a.id);
    const avant = new Set(useLive.getState().alarms.map((x) => x.id));
    avancer(sim, 40);
    // Aucune alarme levée depuis, pas même une « à surveiller » vite refermée.
    expect(useLive.getState().alarms.filter((x) => x.machineId === R02.id && !avant.has(x.id))).toEqual([]);
    expect(ouvertes(R02.id)).toEqual([]);
    expect(useLive.getState().machines[R02.id].etat).not.toBe('panne');
  });

  it('propose « Annuler » dans l’avis de clôture, qui rouvre l’alarme et remet la machine en panne', async () => {
    const sim = new LocalSimulator();
    sim.sync();
    const a = await panne(sim);
    await sim.resolve(a.id);
    const avis = useLive.getState().toasts.find((t) => t.alarmeId === a.id);
    expect(avis?.action?.libelle).toBe('Annuler');
    expect(avis?.exercice).toBe(false);

    avancer(sim, 3);
    avis!.action!.faire();
    await Promise.resolve();
    avancer(sim, 5);
    const rouverte = useLive.getState().alarms.find((x) => x.id === a.id);
    expect(rouverte?.statut).toBe(a.statut);
    expect(rouverte?.finLe).toBeUndefined();
    // La même alarme, pas une seconde levée par-dessus.
    expect(ouvertes(R02.id).filter((x) => x.gravite === 'critique').map((x) => x.id)).toEqual([a.id]);
    expect(useLive.getState().machines[R02.id].etat).toBe('panne');
    // Le journal peut porter entre-temps le calage tiré au hasard d'une autre machine : on cherche la ligne de R02.
    expect(useLive.getState().events.find((e) => e.machineId === R02.id)?.message).toBe(`Clôture annulée, ${a.code} rouverte.`);
  });

  it('ne rouvre plus rien passé le délai d’annulation', async () => {
    const sim = new LocalSimulator();
    sim.sync();
    const a = await panne(sim);
    await sim.resolve(a.id);
    avancer(sim, 15);
    await sim.reopen(a.id);
    expect(useLive.getState().alarms.find((x) => x.id === a.id)?.statut).toBe('resolue');
  });
});

describe('compteurs de production', () => {
  it('comptent depuis le début du poste, d’après l’historique', () => {
    const now = Date.parse('2026-10-07T09:00:00Z');
    const h = getHistory(machines, now);
    const p = productionDuPoste(h, R02.id, now, 100);
    // 11 h à Paris : six heures de poste au plus, à 92 % de 100 étiquettes par minute.
    expect(p.bonnes).toBeGreaterThan(0);
    expect(p.bonnes).toBeLessThan((6 * H) / MIN * 100 * 0.92);
    expect(p.gache).toBeGreaterThan(0);
  });

  it('comptent en marche le temps écoulé depuis la dernière heure pleine de l’historique', () => {
    const treize = new Date('2026-10-07T13:00:00').getTime();
    const h = { debut: 0, fin: treize, periodes: { m: [{ debut: treize - 30 * MIN, fin: treize, etat: 'calage' as const }] }, alarmes: [], trs: {} };
    const p = productionDuPoste(h, 'm', treize + 20 * MIN, 100);
    // Le réglage d'avant 13 h appartient au poste du matin ; depuis, 20 min de marche.
    expect(p.bonnes).toBeCloseTo(20 * 100 * 0.92 * 0.985);
    expect(p.gache).toBeCloseTo(20 * 100 * 0.92 * 0.015);
  });

  it('partent de zéro pour une machine sans historique', () => {
    const now = Date.parse('2026-10-07T09:00:00Z');
    expect(productionDuPoste(getHistory(machines, now), 'm-inconnue', now, 100)).toEqual({ bonnes: 0, gache: 0 });
  });
});

describe('usure en direct', () => {
  it('part de l’usure où l’historique s’arrête, différente d’une machine à l’autre', () => {
    const sim = new LocalSimulator();
    sim.sync();
    avancer(sim, 1);
    const valeurs = useLive.getState().values;
    const blanchets = machines
      .filter((m) => m.type === 'offset')
      .map((m) => {
        const id = machineModel(m).points.find((p) => p.cle === 'heures_blanchet')!.id;
        return { id, v: valeurs[id].v };
      });
    // Au plus 0,0004 h gagnée pendant la seconde simulée.
    for (const b of blanchets) expect(Math.abs(b.v - niveauUsure(b.id, 610))).toBeLessThan(0.001);
    expect(new Set(blanchets.map((b) => Math.round(b.v))).size).toBeGreaterThan(1);
  });
});
