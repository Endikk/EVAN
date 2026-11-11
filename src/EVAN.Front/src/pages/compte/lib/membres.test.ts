import { describe, expect, it } from 'vitest';
import { ErreurApi } from '@/api/http';
import { estSoi, refus, sansMembre, type Membre } from './membres';

const membre = (id: string, identifiant: string, role: Membre['role'] = 'membre'): Membre => ({ id, identifiant, nom: identifiant.split('@')[0], role, creeLe: 0 });

describe('membres de l’organisation', () => {
  it('reconnaît sa propre ligne, quelle que soit la casse saisie à la connexion', () => {
    const moi = membre('1', 'chef@valtiq.fr', 'admin');

    expect(estSoi(moi, 'Chef@Valtiq.fr ')).toBe(true);
    expect(estSoi(membre('2', 'nuit@valtiq.fr'), 'chef@valtiq.fr')).toBe(false);
    expect(estSoi(moi, undefined)).toBe(false);
  });

  it('retire un compte de la liste sans modifier l’ancienne', () => {
    const liste = [membre('1', 'chef@valtiq.fr', 'admin'), membre('2', 'nuit@valtiq.fr')];

    const reste = sansMembre(liste, '2');

    expect(reste.map((m) => m.id)).toEqual(['1']);
    expect(liste).toHaveLength(2);
    expect(reste).not.toBe(liste);
  });

  it('relit la liste quand le compte a disparu entre-temps', () => {
    const r = refus(new ErreurApi(404, 'Compte introuvable dans votre organisation.'), 'retrait');

    expect(r).toEqual({ texte: expect.stringContaining('mise à jour'), relire: true, sessionPerdue: false });
  });

  it('revérifie la session quand celle de l’administrateur est tombée', () => {
    const r = refus(new ErreurApi(401, 'Connexion requise.'), 'provisoire');

    expect(r.sessionPerdue).toBe(true);
    expect(r.texte).toBe('Connexion requise.');
  });

  it('met le refus du mot de passe de l’administrateur sous son champ', () => {
    const r = refus(new ErreurApi(400, 'Action refusée : votre mot de passe est incorrect.', [{ champ: 'motDePasse', message: 'Votre mot de passe est incorrect.' }]), 'retrait');

    expect(r.motDePasse).toBe('Votre mot de passe est incorrect.');
    expect(r.relire).toBe(false);
  });

  it('montre la phrase du serveur pour un refus métier, et une phrase de repli sinon', () => {
    const dernier = refus(new ErreurApi(409, 'C’est le dernier administrateur de l’organisation.'), 'retrait');
    const panne = refus(new TypeError('réseau'), 'provisoire');

    expect(dernier).toEqual({ texte: 'C’est le dernier administrateur de l’organisation.', relire: false, sessionPerdue: false });
    expect(panne.texte).toContain('mot de passe provisoire');
  });
});
