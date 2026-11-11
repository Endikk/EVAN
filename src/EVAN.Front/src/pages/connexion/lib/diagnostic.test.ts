import { describe, expect, it } from 'vitest';
import { conseilPour, lireTest } from './diagnostic';

describe('lecture du test de liaison', () => {
  it('rien de lancé : les deux tronçons attendent', () => {
    expect(lireTest([], false)).toEqual({ etat: 'attente', troncons: ['attente', 'attente'] });
  });

  it('en cours : la passerelle d’abord, puis l’automate', () => {
    expect(lireTest([{ t: 'Test simulé', ok: true }], true).troncons).toEqual(['encours', 'attente']);
    expect(lireTest([{ t: 'a', ok: true }, { t: 'Passerelle : demande reçue', ok: true }], true).troncons).toEqual(['ok', 'encours']);
  });

  it('tout est passé', () => {
    const l = lireTest([{ t: 'a', ok: true }, { t: 'Liaison validée', ok: true }], false);
    expect(l.etat).toBe('ok');
    expect(l.troncons).toEqual(['ok', 'ok']);
  });

  it('une passerelle muette casse le premier tronçon', () => {
    const l = lireTest([{ t: 'Test impossible : la passerelle n’a pas répondu (réponse 502).', ok: false }], false);
    expect(l.etat).toBe('echec');
    expect(l.troncons).toEqual(['echec', 'attente']);
    expect(l.conseil).toMatch(/passerelle de l’usine est allumée/);
  });

  it('un automate qui refuse la connexion casse le second tronçon', () => {
    const l = lireTest([{ t: 'Demande reçue', ok: true }, { t: 'Connexion TCP 10.20.1.21:4840 refusée', ok: false }], false);
    expect(l.troncons).toEqual(['ok', 'echec']);
    expect(l.cause).toBe('Connexion TCP 10.20.1.21:4840 refusée');
    expect(l.conseil).toMatch(/ne répond pas/);
  });
});

describe('conseil selon la cause', () => {
  it('certificat à approuver', () => {
    expect(conseilPour('Certificat du serveur refusé')).toMatch(/approuvé par l’administrateur/);
  });

  it('cause inconnue : vérifier l’adresse, puis l’automaticien', () => {
    expect(conseilPour('Erreur 0x80AB0000')).toMatch(/automaticien/);
  });

  it('une adresse mal formée arrête le test avant tout envoi et renvoie au temps 2', () => {
    const l = lireTest([{ t: 'Adresse mal formée : De la forme opc.tcp://10.20.1.21:4840.', ok: false }], false);
    expect(l.etat).toBe('echec');
    expect(l.troncons).toEqual(['attente', 'attente']);
    expect(l.conseil).toContain('temps 2');
  });
});
