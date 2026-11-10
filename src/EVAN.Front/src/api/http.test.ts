import { afterEach, describe, expect, it, vi } from 'vitest';
import { appel, ENTETE_ECRITURE, ErreurApi, erreurDe } from './http';

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('appels à EVAN.Api', () => {
  it('une écriture porte l’en-tête X-Evan, une lecture non', async () => {
    const fetch = vi.fn(async () => json({ ok: true }));
    vi.stubGlobal('fetch', fetch);

    await appel('PUT', '/api/sites/site-x', { a: 1 });
    await appel('GET', '/api/session');

    const [ecriture, lecture] = fetch.mock.calls.map((c) => (c as unknown as [string, RequestInit])[1].headers as Record<string, string>);
    expect(ecriture['X-Evan']).toBe(ENTETE_ECRITURE['X-Evan']);
    expect(ecriture['Content-Type']).toBe('application/json');
    expect(lecture['X-Evan']).toBeUndefined();
  });

  it('un refus garde le message du serveur et les champs en cause', async () => {
    const erreur = await erreurDe(json({ erreur: 'Configuration refusée.', champs: [{ champ: 'machines[0].nom', message: 'Machine R01 : nom requis.' }] }, 400));

    expect(erreur.statut).toBe(400);
    expect(erreur.message).toBe('Configuration refusée.');
    expect(erreur.champs).toEqual([{ champ: 'machines[0].nom', message: 'Machine R01 : nom requis.' }]);
  });

  it('un refus sans corps lisible reçoit une phrase selon son statut', async () => {
    const erreur = await erreurDe(new Response('<html>', { status: 401 }));

    expect(erreur.message).toMatch(/Connexion requise/);
    expect(erreur.champs).toEqual([]);
  });

  it('un serveur muet donne une erreur de statut 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));

    await expect(appel('GET', '/api/organisation')).rejects.toMatchObject({ statut: 0 });
    await expect(appel('GET', '/api/organisation')).rejects.toBeInstanceOf(ErreurApi);
  });
});
