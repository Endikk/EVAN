/**
 * Source API : la clôture propose « Annuler » comme dans la démo hors ligne, qui part en POST /api/alarms/{id}/reopen ;
 * les écritures du carnet partent vers les routes du carnet de l'usine. Aucun hub n'est ouvert : seul fetch est simulé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarme } from '@/domain/types';
import { useLive } from '@/store/live';
import { ApiSource } from './apiSource';

const alarme: Alarme = {
  id: 'al-1',
  code: 'TB-101',
  message: 'Tension hors tolérance',
  gravite: 'critique',
  machineId: 'm-r01',
  organeId: 'm-r01.o1',
  horodatage: 1_000,
  statut: 'active',
  regle: 'seuil',
};

let appels: { url: string; method: string; body?: unknown }[] = [];
let reponses: number[] = [];

beforeEach(() => {
  appels = [];
  reponses = [];
  useLive.setState({ alarms: [alarme], toasts: [] });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      appels.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body as string) : undefined });
      return new Response(null, { status: reponses.shift() ?? 200 });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

/** Laisse partir les requêtes lancées sans attente (carnet) et leurs suites. */
const attendre = () => new Promise((r) => setTimeout(r, 0));

describe('clôture et réouverture en mode API', () => {
  it('propose « Annuler » après la clôture, qui rouvre l’alarme sur le serveur', async () => {
    const src = new ApiSource('site-tours');
    await src.resolve('al-1');

    const avis = useLive.getState().toasts[0];
    expect(avis.titre).toBe('TB-101 résolue');
    expect(avis.action?.libelle).toBe('Annuler');

    avis.action!.faire();
    await attendre();
    expect(appels.map((a) => `${a.method} ${a.url}`)).toEqual(['POST /api/alarms/al-1/resolve', 'POST /api/alarms/al-1/reopen']);
  });

  it('une clôture refusée ne propose pas d’annuler', async () => {
    reponses = [409];
    await new ApiSource('site-tours').resolve('al-1');

    const avis = useLive.getState().toasts[0];
    expect(avis.titre).toBe('Clôture non transmise');
    expect(avis.action).toBeUndefined();
  });

  it('dit quand le délai pour annuler est passé', async () => {
    reponses = [409];
    await new ApiSource('site-tours').reopen('al-1');

    const avis = useLive.getState().toasts[0];
    expect(avis.titre).toBe('Clôture non annulée');
    expect(avis.texte).toContain('délai');
  });
});

describe('carnet en mode API', () => {
  const saisie = { id: 'sa-1', machineId: 'm-r01', type: 'preventive' as const, date: 1_000, duree: 40, titre: 'Lame changée', auteur: 'Équipe matin' };
  const prevue = { id: 'pv-1', machineId: 'm-r04', titre: 'Remplacer la lampe UV', date: 5_000, duree: 45 };

  it('envoie chaque écriture à la route du carnet de l’usine', async () => {
    const { carnet } = new ApiSource('site-tours');
    carnet.corriger(saisie);
    carnet.supprimer('sa-1');
    carnet.restaurer(saisie);
    carnet.planifier(prevue);
    carnet.annulerPrevue('pv-1');
    await attendre();

    // Dans l'ordre des gestes pour une même saisie, ou une même intervention planifiée.
    const routes = appels.map((a) => `${a.method} ${a.url}`);
    expect(routes.filter((r) => !r.includes('prevues'))).toEqual([
      'PUT /api/sites/site-tours/interventions/sa-1',
      'DELETE /api/sites/site-tours/interventions/sa-1',
      'POST /api/sites/site-tours/interventions',
    ]);
    expect(routes.filter((r) => r.includes('prevues'))).toEqual([
      'POST /api/sites/site-tours/interventions/prevues',
      'DELETE /api/sites/site-tours/interventions/prevues/pv-1',
    ]);
    expect(appels.find((a) => a.method === 'PUT')?.body).toEqual(saisie);
    expect(appels.find((a) => a.url.endsWith('/prevues'))?.body).toEqual(prevue);
    expect(useLive.getState().toasts).toEqual([]);
  });

  it('signale une écriture refusée, mais pas une suppression déjà faite sur le serveur', async () => {
    reponses = [404, 500];
    const { carnet } = new ApiSource('site-tours');
    carnet.supprimer('sa-1');
    carnet.planifier(prevue);
    await attendre();
    await attendre();

    expect(useLive.getState().toasts.map((t) => t.titre)).toEqual(['Planification non enregistrée sur le serveur']);
  });
});

describe('ordre des écritures du carnet', () => {
  const saisie = { id: 'sa-1', machineId: 'm-r01', type: 'preventive' as const, date: 1_000, duree: 40, titre: 'Lame changée', auteur: 'Équipe matin' };
  const prevue = { id: 'pv-1', machineId: 'm-r04', titre: 'Remplacer la lampe UV', date: 5_000, duree: 45 };

  /** Le serveur ne répond à une requête qu'au signal : on voit ce qui part pendant qu'elle attend. */
  function serveurLent() {
    const enAttente: (() => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url: string, init: RequestInit) =>
          new Promise<Response>((repondre) => {
            appels.push({ url, method: init.method ?? 'GET' });
            enAttente.push(() => repondre(new Response(null, { status: 200 })));
          }),
      ),
    );
    return { repondre: () => enAttente.shift()?.() };
  }

  it('« Annuler » juste après « Consigner » attend que la saisie soit arrivée avant de la supprimer', async () => {
    const serveur = serveurLent();
    const src = new ApiSource('site-tours');
    src.logIntervention(saisie);
    src.carnet.supprimer('sa-1');
    await attendre();
    // Le POST n'a pas encore de réponse : le DELETE attend, sinon il passerait avant et la saisie resterait au serveur.
    expect(appels.map((a) => a.method)).toEqual(['POST']);

    serveur.repondre();
    await attendre();
    expect(appels.map((a) => `${a.method} ${a.url}`)).toEqual([
      'POST /api/sites/site-tours/interventions',
      'DELETE /api/sites/site-tours/interventions/sa-1',
    ]);
  });

  it('une intervention planifiée remise après son annulation part après l’annulation', async () => {
    const serveur = serveurLent();
    const { carnet } = new ApiSource('site-tours');
    carnet.annulerPrevue('pv-1');
    carnet.planifier(prevue);
    await attendre();
    expect(appels.map((a) => a.method)).toEqual(['DELETE']);

    serveur.repondre();
    await attendre();
    expect(appels.map((a) => a.method)).toEqual(['DELETE', 'POST']);
  });

  it('les écritures de saisies différentes ne s’attendent pas', async () => {
    serveurLent();
    const src = new ApiSource('site-tours');
    src.logIntervention(saisie);
    src.carnet.supprimer('sa-2');
    await attendre();
    expect(appels.map((a) => a.method)).toEqual(['POST', 'DELETE']);
  });
});
