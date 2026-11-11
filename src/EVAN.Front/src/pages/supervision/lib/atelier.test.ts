import { describe, expect, it } from 'vitest';
import type { Alarme, EtatMachine, Machine } from '@/domain/types';
import type { MachineLive } from '@/store/live';
import { depuisCompteurs, enumerer, etatAtelier, minusculeInitiale, motVitesse, nonProductives, parUrgence, verdictAtelier } from './atelier';

const machine = (numero: string): Machine => ({
  id: `m-${numero}`,
  batimentId: 'b',
  type: 'flexo',
  nom: `Machine ${numero}`,
  numero,
  position: [0, 0],
  rotationDeg: 0,
  modele: { url: '' },
});

const live = (etat: EtatMachine, horsLigne = false): MachineLive => ({ etat, vitesse: 100, facteur: 0.9, depuis: 0, bonnes: 0, gache: 0, horsLigne });

const alarme = (p: Partial<Alarme>): Alarme => ({
  id: p.id ?? 'a1',
  code: 'TB-11',
  message: 'Tension bande hors limite',
  gravite: 'critique',
  machineId: 'm-R03',
  organeId: 'm-R03.o2',
  horodatage: 0,
  statut: 'active',
  regle: 'seuil',
  ...p,
});

const MIN = 60_000;
const lieu = () => ({ numero: 'R03', organe: 'Groupe d’impression 2' });

describe('état de l’atelier', () => {
  const machines = ['R01', 'R02', 'R03', 'PV01'].map(machine);
  const etat = etatAtelier(machines, { 'm-R01': live('marche'), 'm-R02': live('calage'), 'm-R03': live('attention'), 'm-PV01': live('arret', true) });

  it('compte les machines qui produisent (en marche ou à surveiller)', () => {
    expect(etat.produisent).toBe(2);
    expect(etat.suivies).toBe(3);
    expect(etat.horsLigne.map((m) => m.numero)).toEqual(['PV01']);
  });

  it('range la bande : ce qui produit d’abord, la liaison perdue à la fin', () => {
    expect(etat.bande.map((b) => b.machine.numero)).toEqual(['R01', 'R03', 'R02', 'PV01']);
  });
});

describe('phrase du bandeau', () => {
  const machines = ['R01', 'R02', 'R03'].map(machine);

  it('nomme ce qui ne produit pas sans répéter le compte du repère, ni dire « tout tourne »', () => {
    const a = etatAtelier(machines, { 'm-R01': live('marche'), 'm-R02': live('arret'), 'm-R03': live('calage') });
    const v = verdictAtelier(a, [], lieu, 0);
    expect(v.ton).toBe('ok');
    expect(v.texte).toBe('Aucune alarme. R03 en réglage et R02 à l’arrêt.');
    // Rien à faire : pas de seconde ligne.
    expect(v.suite).toBeUndefined();
    expect(nonProductives(a)).toBe('R03 est en réglage (calage). R02 est à l’arrêt.');
  });

  it('dit « tout tourne » seulement quand toutes les machines produisent', () => {
    const a = etatAtelier(machines, { 'm-R01': live('marche'), 'm-R02': live('marche'), 'm-R03': live('attention') });
    expect(verdictAtelier(a, [], lieu, 0).texte).toBe('Tout tourne, aucune alarme.');
  });

  it('met la panne en tête, avec la machine, la durée et l’organe', () => {
    const a = etatAtelier(machines, { 'm-R01': live('marche'), 'm-R02': live('marche'), 'm-R03': live('panne') });
    const v = verdictAtelier(a, [alarme({ horodatage: 0 })], lieu, 4 * MIN);
    expect(v.ton).toBe('crit');
    expect(v.texte).toBe('Panne sur R03 depuis 4 min, côté groupe d’impression 2.');
    expect(v.suite).toBe('Pas encore prise en charge.');
    expect(v.alarmeId).toBe('a1');
  });

  it('signale un point à surveiller sans parler de panne', () => {
    const a = etatAtelier(machines, { 'm-R01': live('marche'), 'm-R02': live('marche'), 'm-R03': live('attention') });
    const v = verdictAtelier(a, [alarme({ gravite: 'attention' })], lieu, MIN);
    expect(v.ton).toBe('warn');
    expect(v.texte).toBe('Aucune panne. Un point à surveiller sur R03, côté groupe d’impression 2.');
    expect(v.action).toBe('Voir le point à surveiller');
  });

  it('attend les données avant de conclure', () => {
    expect(verdictAtelier(etatAtelier(machines, {}), [], lieu, 0).texte).toBe('Connexion aux machines en cours…');
  });
});

describe('tri par urgence', () => {
  it('panne non prise en charge, puis panne prise en charge, puis attention ; la plus ancienne d’abord', () => {
    const liste = parUrgence([
      alarme({ id: 'att', gravite: 'attention', horodatage: 1 }),
      alarme({ id: 'acq', statut: 'acquittee', horodatage: 2 }),
      alarme({ id: 'recente', horodatage: 5 }),
      alarme({ id: 'ancienne', horodatage: 3 }),
      alarme({ id: 'close', statut: 'resolue', horodatage: 0 }),
    ]);
    expect(liste.map((a) => a.id)).toEqual(['ancienne', 'recente', 'acq', 'att']);
  });
});

describe('mots', () => {
  it('garde les sigles en tête de nom', () => {
    expect(minusculeInitiale('Groupe d’impression 2')).toBe('groupe d’impression 2');
    expect(minusculeInitiale('UV et séchage')).toBe('UV et séchage');
  });

  it('énumère à la française', () => {
    expect(enumerer(['R01'])).toBe('R01');
    expect(enumerer(['R01', 'R02', 'R03'])).toBe('R01, R02 et R03');
  });

});

describe('vitesse en mots', () => {
  it('dit « S’arrête » tant qu’une machine en panne ralentit encore', () => {
    expect(motVitesse('panne', 0.15).mot).toBe('S’arrête');
    expect(motVitesse('panne', 0).mot).toBe('Arrêtée');
    expect(motVitesse('arret', 0.01).mot).toBe('Arrêtée');
  });

  it('distingue la marche normale du ralenti', () => {
    expect(motVitesse('marche', 0.95)).toEqual({ ton: 'ok', mot: 'Normale' });
    expect(motVitesse('attention', 0.5)).toEqual({ ton: 'warn', mot: 'Ralentie' });
    expect(motVitesse('calage', 0.18).mot).toBe('Réglage');
  });
});

describe('période des compteurs', () => {
  it('dit le début du poste en démonstration, et la source des compteurs sur l’API', () => {
    expect(depuisCompteurs('local', new Date('2026-10-08T13:00:00').getTime())).toBe('depuis le début du poste (13 h)');
    expect(depuisCompteurs('api', 0)).toBe('selon les compteurs remontés par les machines');
  });
});
