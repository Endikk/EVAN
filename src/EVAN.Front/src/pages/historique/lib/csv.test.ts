import { describe, expect, it } from 'vitest';
import type { Alarme, Machine } from '@/domain/types';
import { journalCsv, nombreCsv } from './csv';

const machine: Machine = { id: 'r1', batimentId: 'b', type: 'flexo', nom: 'Presse', numero: 'R01', position: [0, 0], rotationDeg: 0, modele: { url: '' } };
// Mardi 10 novembre 2026 à 9 h 18, heure de Paris (fixée par vitest.config.ts).
const t = new Date(2026, 10, 10, 9, 18).getTime();

const alarme: Alarme = {
  id: 'a',
  code: 'UV-06',
  message: 'Puissance UV insuffisante',
  gravite: 'critique',
  machineId: 'r1',
  organeId: 'uv',
  horodatage: t,
  finLe: t + 9 * 60_000,
  acquitteeLe: t + 2 * 60_000,
  statut: 'acquittee',
  regle: 'seuil',
  valeur: 235.456,
  unite: 'N',
};

describe('export du journal pour un tableur', () => {
  it('écrit la date et l’heure locales, la virgule décimale et les mots de l’écran', () => {
    const csv = journalCsv([alarme], [machine], new Map());
    const [tete, ligne] = csv.replace(/^﻿/, '').split('\n');

    expect(tete).toBe('"Date";"Heure";"Machine";"Organe";"Code";"Message";"Valeur";"Unité";"Type";"Gravité";"Statut";"Durée (min)";"Cause probable"');
    expect(ligne).toBe(
      '"10/11/2026";"09:18";"R01 Presse";"";"UV-06";"Puissance UV insuffisante";"235,46";"N";"Limite dépassée";"Critique";"Prise en charge";"9";""',
    );
  });

  it('garde la marque d’ordre des octets pour les accents', () => {
    expect(journalCsv([], [], new Map()).startsWith('﻿')).toBe(true);
  });

  it('écrit un nombre sans séparateur de milliers', () => {
    expect(nombreCsv(1234.5)).toBe('1234,5');
    expect(nombreCsv(12)).toBe('12');
  });
});
