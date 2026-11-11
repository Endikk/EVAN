import { beforeEach, describe, expect, it } from 'vitest';
import type { Saisie } from '@/analytics/maintenance';
import { debutConsigne, useCarnet } from './carnet';

const now = Date.parse('2026-11-11T14:00:00Z');
const MIN = 60_000;

const saisie: Omit<Saisie, 'id'> = { machineId: 'm-r04', type: 'preventive', date: now - 60 * MIN, duree: 45, titre: 'Remplacer la lampe UV', auteur: 'Test', tacheId: 'uv' };

describe('carnet : saisies', () => {
  beforeEach(() => useCarnet.getState().charger('demo'));

  it('retire une saisie et la remet à l’identique (« Annuler »)', () => {
    const s = useCarnet.getState().ajouter(saisie);
    const retiree = useCarnet.getState().retirer(s.id);
    expect(retiree).toEqual(s);
    expect(useCarnet.getState().saisies).toEqual([]);
    useCarnet.getState().restaurer(s);
    expect(useCarnet.getState().saisies).toEqual([s]);
  });

  it('corrige une saisie sans changer son identifiant', () => {
    const s = useCarnet.getState().ajouter(saisie);
    const c = useCarnet.getState().corriger(s.id, { ...saisie, duree: 60, titre: 'Lampe UV et réflecteur' });
    expect(c?.id).toBe(s.id);
    expect(useCarnet.getState().saisies).toEqual([{ ...saisie, duree: 60, titre: 'Lampe UV et réflecteur', id: s.id }]);
  });
});

describe('carnet : interventions planifiées', () => {
  beforeEach(() => useCarnet.getState().charger('demo'));

  const planifier = (date: number) =>
    useCarnet.getState().planifier({ machineId: 'm-r04', organeId: 'm-r04.o5', tacheId: 'uv', titre: 'Remplacer la lampe UV', date, duree: 45, pointId: 'm-r04.o5.puissance_uv' });

  it('n’entre pas au journal tant qu’elle n’est pas consignée', () => {
    planifier(now + 86_400_000);
    expect(useCarnet.getState().prevues).toHaveLength(1);
    expect(useCarnet.getState().saisies).toEqual([]);
  });

  it('se déplace et s’annule', () => {
    const p = planifier(now + 86_400_000);
    useCarnet.getState().deplacer(p.id, now + 2 * 86_400_000);
    expect(useCarnet.getState().prevues[0].date).toBe(now + 2 * 86_400_000);
    expect(useCarnet.getState().annulerPrevue(p.id)?.id).toBe(p.id);
    expect(useCarnet.getState().prevues).toEqual([]);
  });

  it('se consigne en un geste : elle devient une saisie de sa tâche et quitte la liste', () => {
    const p = planifier(now - 3 * 3_600_000);
    const r = useCarnet.getState().consignerPrevue(p.id, now)!;
    expect(r.saisie).toMatchObject({ machineId: 'm-r04', organeId: 'm-r04.o5', tacheId: 'uv', type: 'preventive', date: p.date, duree: 45, auteur: 'Maintenance' });
    expect(useCarnet.getState().prevues).toEqual([]);
    expect(useCarnet.getState().saisies).toEqual([r.saisie]);
  });

  it('consignée avant son heure, elle commence maintenant moins sa durée et ne finit pas dans le futur', () => {
    expect(debutConsigne({ date: now + 86_400_000, duree: 45 }, now)).toBe(now - 45 * MIN);
    expect(debutConsigne({ date: now - 10 * MIN, duree: 45 }, now)).toBe(now - 45 * MIN);
    expect(debutConsigne({ date: now - 3 * 3_600_000, duree: 45 }, now)).toBe(now - 3 * 3_600_000);
  });

  it('remet une intervention annulée avec le même identifiant', () => {
    const p = planifier(now + 86_400_000);
    useCarnet.getState().annulerPrevue(p.id);
    useCarnet.getState().planifier(p);
    expect(useCarnet.getState().prevues).toEqual([p]);
  });
});
