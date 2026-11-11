import { describe, expect, it } from 'vitest';
import { ErreurApi } from '@/api/http';
import { filtrer, issueLecture, jours, personnes, phrase, type LigneJournal } from './journal';

// Dates construites en heure locale : le test vaut quel que soit le fuseau de la machine.
const maintenant = new Date(2026, 10, 11, 15, 0).getTime();
const ligne = (action: string, auteur: string, cible: string, le: Date, adresse = '192.168.1.12'): LigneJournal => ({ action, auteur, cible, adresse, le: le.getTime() });

const journal: LigneJournal[] = [
  ligne('reinitialisation', 'chef@valtiq.fr', 'nuit@valtiq.fr', new Date(2026, 10, 11, 14, 32)),
  ligne('changement', 'nuit@valtiq.fr', 'nuit@valtiq.fr', new Date(2026, 10, 11, 9, 5)),
  ligne('retrait', 'chef@valtiq.fr', 'parti@valtiq.fr', new Date(2026, 10, 10, 18, 0)),
  ligne('creation', 'qualite@valtiq.fr', 'nuit@valtiq.fr', new Date(2026, 10, 3, 8, 15)),
  ligne('creation', 'chef@valtiq.fr', 'qualite@valtiq.fr', new Date(2025, 11, 30, 10, 0)),
];

describe('journal des comptes', () => {
  it('dit chaque action en clair, sans répéter la cible quand le titulaire agit sur son propre compte', () => {
    expect(phrase(journal[3])).toEqual({ verbe: 'a créé le compte de', cible: 'nuit@valtiq.fr' });
    expect(phrase(journal[2])).toEqual({ verbe: 'a retiré', cible: 'parti@valtiq.fr' });
    expect(phrase(journal[0])).toEqual({ verbe: 'a donné un mot de passe provisoire à', cible: 'nuit@valtiq.fr' });
    expect(phrase(journal[1])).toEqual({ verbe: 'a changé son mot de passe' });
  });

  it('garde une action inconnue lisible plutôt que de la taire', () => {
    expect(phrase(ligne('fusion', 'chef@valtiq.fr', 'nuit@valtiq.fr', new Date()))).toEqual({ verbe: 'a modifié le compte de', cible: 'nuit@valtiq.fr' });
  });

  it('range les lignes par jour local, le plus récent d’abord, en nommant aujourd’hui et hier', () => {
    const groupes = jours(journal, maintenant);

    expect(groupes.map((g) => g.titre)).toEqual(['Aujourd’hui', 'Hier', 'Mardi 3 novembre', 'Mardi 30 décembre 2025']);
    expect(groupes[0].lignes.map((l) => l.heure)).toEqual(['14:32', '09:05']);
    expect(groupes[0].lignes[0].ligne).toBe(journal[0]);
  });

  it('propose chaque personne une seule fois, auteur ou cible, par ordre alphabétique', () => {
    expect(personnes(journal)).toEqual(['chef@valtiq.fr', 'nuit@valtiq.fr', 'parti@valtiq.fr', 'qualite@valtiq.fr']);
  });

  it('filtre par action et par personne, qu’elle ait agi ou subi l’action', () => {
    expect(filtrer(journal, { action: 'creation', personne: '' })).toHaveLength(2);
    expect(filtrer(journal, { action: '', personne: 'nuit@valtiq.fr' }).map((l) => l.action)).toEqual(['reinitialisation', 'changement', 'creation']);
    expect(filtrer(journal, { action: 'retrait', personne: 'nuit@valtiq.fr' })).toEqual([]);
    expect(filtrer(journal, { action: '', personne: '' })).toBe(journal);
  });

  it('masque la section sur 403, revérifie la session sur 401, montre la phrase du serveur sinon', () => {
    expect(issueLecture(new ErreurApi(403, 'Réservé aux administrateurs de l’organisation.'))).toEqual({ masquer: true, sessionPerdue: false, texte: '' });
    expect(issueLecture(new ErreurApi(401, 'Connexion requise.'))).toEqual({ masquer: false, sessionPerdue: true, texte: 'Connexion requise.' });
    expect(issueLecture(new ErreurApi(0, 'Le serveur EVAN ne répond pas.')).texte).toBe('Le serveur EVAN ne répond pas.');
    expect(issueLecture(new TypeError('réseau')).texte).toBe('Journal indisponible pour l’instant.');
  });
});
