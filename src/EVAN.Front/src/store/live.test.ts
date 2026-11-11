import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLive } from './live';

describe('avis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useLive.setState({ toasts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('remplace l’avis « à surveiller » quand la même mesure passe en panne (nouvelle alarme, même titre)', () => {
    const { pushToast } = useLive.getState();
    pushToast({ gravite: 'attention', titre: 'EM-01 · R04 Gallus', alarmeId: 'al-1' });
    pushToast({ gravite: 'critique', titre: 'EM-01 · R04 Gallus', alarmeId: 'al-2' });
    const toasts = useLive.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ gravite: 'critique', alarmeId: 'al-2' });
  });

  it('garde côte à côte les avis de deux alarmes différentes et les avis sans alarme', () => {
    const { pushToast } = useLive.getState();
    pushToast({ gravite: 'critique', titre: 'EM-01 · R04 Gallus', alarmeId: 'al-1' });
    pushToast({ gravite: 'critique', titre: 'DC-07 · R02 Mark Andy', alarmeId: 'al-2' });
    pushToast({ gravite: 'info', titre: 'EM-01 · R04 Gallus' });
    expect(useLive.getState().toasts).toHaveLength(3);
  });

  it('ferme l’avis après sa durée : 12 s pour une panne, 10 s s’il porte une action', () => {
    const { pushToast } = useLive.getState();
    pushToast({ gravite: 'critique', titre: 'Panne', alarmeId: 'al-1' });
    pushToast({ gravite: 'info', titre: 'R01 retirée', action: { libelle: 'Annuler', faire: () => undefined } });
    vi.advanceTimersByTime(10_001);
    expect(useLive.getState().toasts.map((t) => t.titre)).toEqual(['Panne']);
    vi.advanceTimersByTime(2_000);
    expect(useLive.getState().toasts).toHaveLength(0);
  });
});
