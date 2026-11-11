/**
 * Carnet branché sur l'API d'EVAN : chaque correction, suppression et intervention planifiée part aussi au serveur
 * (getSource().carnet), pour que l'assistant et le serveur MCP voient le même carnet que le navigateur.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CarnetDistant } from '@/realtime/source';

const serveur = vi.hoisted(() => ({
  corriger: vi.fn(),
  supprimer: vi.fn(),
  restaurer: vi.fn(),
  planifier: vi.fn(),
  annulerPrevue: vi.fn(),
}));

vi.mock('@/realtime/source', () => ({ getSource: () => ({ kind: 'api', carnet: serveur satisfies CarnetDistant }) }));

const { useCarnet } = await import('./carnet');

const saisie = { machineId: 'm-r01', type: 'preventive' as const, date: 1_000, duree: 40, titre: 'Lame changée', auteur: 'Équipe matin', tacheId: 'outil' };
const prevue = { machineId: 'm-r04', organeId: 'm-r04.o5', tacheId: 'uv', titre: 'Remplacer la lampe UV', date: 5_000, duree: 45 };

describe('carnet branché sur le serveur', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCarnet.setState({ saisies: [], prevues: [], persistant: false, enCorrection: null });
  });

  it('envoie la correction et la suppression d’une saisie, et sa remise après « Annuler »', () => {
    const s = useCarnet.getState().ajouter(saisie);
    const corrigee = useCarnet.getState().corriger(s.id, { ...saisie, titre: 'Lame et contre-lame changées' })!;
    expect(serveur.corriger).toHaveBeenCalledWith(corrigee);

    const retiree = useCarnet.getState().retirer(s.id)!;
    expect(serveur.supprimer).toHaveBeenCalledWith(s.id);
    useCarnet.getState().restaurer(retiree);
    expect(serveur.restaurer).toHaveBeenCalledWith(retiree);
  });

  it('n’envoie rien pour une saisie inconnue', () => {
    useCarnet.getState().retirer('inconnue');
    useCarnet.getState().corriger('inconnue', saisie);
    expect(serveur.supprimer).not.toHaveBeenCalled();
    expect(serveur.corriger).not.toHaveBeenCalled();
  });

  it('envoie la planification, le déplacement et l’annulation d’une intervention', () => {
    const p = useCarnet.getState().planifier(prevue);
    expect(serveur.planifier).toHaveBeenLastCalledWith(p);

    useCarnet.getState().deplacer(p.id, 9_000);
    expect(serveur.planifier).toHaveBeenLastCalledWith({ ...p, date: 9_000 });

    useCarnet.getState().annulerPrevue(p.id);
    expect(serveur.annulerPrevue).toHaveBeenCalledWith(p.id);
  });

  it('consigner une intervention planifiée la retire du serveur (la saisie part avec logIntervention)', () => {
    const p = useCarnet.getState().planifier(prevue);
    const r = useCarnet.getState().consignerPrevue(p.id, 10_000_000)!;

    expect(r.saisie.tacheId).toBe('uv');
    expect(serveur.annulerPrevue).toHaveBeenCalledWith(p.id);
    // La saisie elle-même n'est pas envoyée par le carnet : actions.ts la passe à logIntervention.
    expect(serveur.restaurer).not.toHaveBeenCalled();
  });
});
