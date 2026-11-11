import { describe, expect, it } from 'vitest';
import { debutPropose, verifier } from './bon';
import { ecrireDuree, lireDuree } from './duree';
import { dateProposee, verifierPlanification } from './planification';

const now = Date.parse('2026-11-11T14:00:00Z');

/** Valeur d'un champ datetime-local à l'heure locale. */
function champ(t: number) {
  const d = new Date(t);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

describe('durée saisie', () => {
  it('lit les minutes et les heures comme on les tape à l’atelier', () => {
    expect(lireDuree('45')).toBe(45);
    expect(lireDuree('45 min')).toBe(45);
    expect(lireDuree('1h30')).toBe(90);
    expect(lireDuree('1 h 30')).toBe(90);
    expect(lireDuree('1:30')).toBe(90);
    expect(lireDuree('2 h')).toBe(120);
    expect(lireDuree('1,5 h')).toBe(90);
    expect(lireDuree('1h75')).toBeNull();
    expect(lireDuree('demi-heure')).toBeNull();
  });

  it('s’écrit de façon à se relire', () => {
    for (const m of [5, 45, 60, 90, 135]) expect(lireDuree(ecrireDuree(m))).toBe(m);
  });
});

describe('bon de travail', () => {
  const ok = { machineId: 'm-r04', titre: 'Lampe UV remplacée', duree: '45 min', date: champ(debutPropose(now, 45)) };

  it('propose un début qui laisse l’intervention finir avant maintenant', () => {
    expect(verifier(ok, true, now)).toEqual({});
    expect(debutPropose(now, 45) + 45 * 60_000).toBeLessThanOrEqual(now);
  });

  it('refuse une durée nulle et une fin dans le futur', () => {
    expect(verifier({ ...ok, duree: '0' }, true, now).duree).toBe('Indiquez au moins 1 minute.');
    expect(verifier({ ...ok, date: champ(now - 10 * 60_000), duree: '1 h' }, true, now).date).toMatch(/finirait plus tard que maintenant/);
  });

  it('range les erreurs dans l’ordre du formulaire : machine, intitulé, début, durée', () => {
    const e = verifier({ machineId: '', titre: '', duree: 'x', date: '' }, false, now);
    expect(Object.keys(e)).toEqual(['machine', 'titre', 'date', 'duree']);
  });
});

describe('planification', () => {
  it('propose le lendemain à 13 h, avant la date limite et jamais dans le passé', () => {
    const t = dateProposee(now);
    expect(new Date(t).getHours()).toBe(13);
    expect(t).toBeGreaterThan(now);
    const limite = now + 5 * 3_600_000;
    const avant = dateProposee(now, limite);
    expect(avant).toBeLessThan(limite);
    expect(avant).toBeGreaterThan(now);
  });

  it('refuse une date passée : ce qui est fait se consigne', () => {
    expect(verifierPlanification({ date: champ(now - 3_600_000), duree: '45' }, now).date).toMatch(/passée/);
    expect(verifierPlanification({ date: champ(now + 86_400_000), duree: '1h30' }, now)).toEqual({});
  });
});
