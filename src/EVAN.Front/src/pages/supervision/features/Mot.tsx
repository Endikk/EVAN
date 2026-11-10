/**
 * La forme de chaque ton, sur la supervision : celle des états de machine du plan (rond : tout va bien, triangle : à
 * surveiller, carré : panne), pour que l'œil n'ait qu'un seul code à apprendre.
 */
import type { EtatMachine } from '@/domain/types';
import type { Ton } from '../lib/atelier';

export const GLYPHE: Record<Ton, EtatMachine> = { ok: 'marche', warn: 'attention', crit: 'panne', neutre: 'arret' };
