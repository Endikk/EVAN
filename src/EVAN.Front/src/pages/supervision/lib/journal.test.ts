import { describe, expect, it } from 'vitest';
import type { Evenement } from '@/domain/types';
import { ligneJournal } from './journal';

const ev = (p: Partial<Evenement>): Evenement => ({ id: 'e', type: 'etat', horodatage: 0, message: '', ...p });

describe('journal en clair', () => {
  it('raconte un réglage au passé, la machine en sujet', () => {
    expect(ligneJournal(ev({ message: 'R06 · Calage d’un nouveau travail' }))).toEqual({ sujet: 'R06', texte: 'a commencé le réglage (calage) d’un nouveau travail.' });
  });

  it('raconte une alarme levée par EVAN', () => {
    const l = ligneJournal(ev({ type: 'alarme', message: 'MS-03 · RF01 Refendeuse · Étiquette manquante détectée' }));
    expect(l).toEqual({ sujet: 'EVAN', texte: 'a déclenché l’alarme MS-03 sur RF01 (étiquette manquante détectée).' });
  });

  it('distingue un point à surveiller d’une alarme déclenchée', () => {
    const l = ligneJournal(ev({ type: 'alarme', message: 'IK-05 · R02 Rotative offset · Écart de densité au groupe 5' }), 'attention');
    expect(l.texte).toBe('a signalé un point à surveiller sur R02, IK-05 (écart de densité au groupe 5).');
  });

  it('fait de la personne qui a agi le sujet', () => {
    const l = ligneJournal(ev({ type: 'action', message: 'Alarme MS-03 acquittée', auteur: 'Superviseur (démo)' }));
    expect(l).toEqual({ sujet: 'Superviseur (démo)', texte: 'a pris en charge l’alarme MS-03.' });
  });

  it('raconte une clôture annulée (alarme rouverte)', () => {
    const l = ligneJournal(ev({ type: 'action', message: 'Clôture annulée, CF-02 rouverte.', auteur: 'Maintenance (démo)' }));
    expect(l).toEqual({ sujet: 'Maintenance (démo)', texte: 'a annulé la clôture : l’alarme CF-02 est de nouveau ouverte.' });
  });

  it('garde un message inconnu tel quel', () => {
    expect(ligneJournal(ev({ type: 'systeme', message: 'Passerelle redémarrée', auteur: 'EVAN' }))).toEqual({ texte: 'Passerelle redémarrée (EVAN)' });
  });
});
