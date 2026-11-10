/**
 * Moteur de règles : cas communs avec le back (data/tests/regles.json), rejoués aussi par
 * tests/EVAN.Core.Tests/RulesEngineTests.cs. Mêmes mesures, mêmes alarmes émises, dans le même ordre.
 */
import { describe, expect, it } from 'vitest';
import regles from '@data/tests/regles.json';
import type { Alarme, Organe, PointDeMesure, Seuils } from '@/domain/types';
import type { MesureDef, OrganeDef } from '@/domain/catalog';
import type { Niveau } from '@/store/live';
import { RulesEngine, classify } from './rules';

interface OrganeCas {
  numero: number;
  nom: string;
  methode?: string;
  alarme?: { code: string; message: string };
}

interface Serie {
  n: number;
  depart: number;
  pente: number;
  amplitude?: number;
  pulsation?: number;
}

type Etape = { mesures: number[] } | { serie: Serie } | { resoudre: number };

/** Événement attendu : seuls les champs écrits sont comparés, null voulant dire absent. */
interface Attendu {
  type: 'raised' | 'cleared' | 'updated';
  alarme: number;
  [champ: string]: unknown;
}

interface Cas {
  nom: string;
  point?: Partial<PointDeMesure>;
  organe?: Partial<OrganeCas>;
  panne?: { mesure: string; cause: string };
  dynamique?: MesureDef['dynamique'];
  recentes?: number;
  enService?: boolean;
  etapes: Etape[];
  niveaux?: Niveau[];
  evenements: Attendu[];
}

interface Fichier {
  point: PointDeMesure;
  organe: OrganeCas;
  classement: { v: number; seuils?: Seuils; niveau: Niveau }[];
  cas: Cas[];
}

const FICHIER = regles as unknown as Fichier;
const PAS_MS = 1000;
/** Sinus et puissances : la bibliothèque mathématique peut différer au dernier bit près entre le navigateur et .NET. */
const TOLERANCE = 1e-9;

/** Joue un cas sur un moteur neuf : niveaux rendus et événements émis, chaque alarme numérotée dans l'ordre d'apparition. */
function jouer(c: Cas) {
  const point: PointDeMesure = { ...FICHIER.point, ...c.point };
  const o: OrganeCas = { ...FICHIER.organe, ...c.organe };
  const organe: Organe = { id: point.organeId, machineId: point.machineId, numero: o.numero, nom: o.nom, capteurs: [], pannesTypiques: [], methode: o.methode };
  const mesure: MesureDef = { cle: point.cle, libelle: point.libelle, type: point.type, unite: point.unite, nominal: point.nominal, bruit: 0, seuils: point.seuils, dynamique: c.dynamique };
  const def: OrganeDef = {
    numero: o.numero,
    nom: o.nom,
    capteurs: [],
    pannesTypiques: [],
    methode: o.methode,
    alarme: o.alarme,
    mesures: [mesure],
    panne: c.panne ? { mesure: c.panne.mesure, forme: 'rampe', cible: 0, duree: 1, cause: c.panne.cause } : undefined,
    cylindres: [],
  };
  const emis: { a: Alarme; kind: string }[] = [];
  const moteur = new RulesEngine({
    organe: () => organe,
    def: () => def,
    countRecent: () => c.recentes ?? 0,
    emit: (a, kind) => emis.push({ a: { ...a }, kind }),
  });

  const ids: string[] = [];
  const niveaux: Niveau[] = [];
  let t = 0;
  const mesurer = (v: number) => niveaux.push(moteur.evaluate(point, v, (t += PAS_MS), c.enService ?? true));
  for (const etape of c.etapes) {
    if ('mesures' in etape) etape.mesures.forEach(mesurer);
    else if ('serie' in etape) {
      const s = etape.serie;
      for (let i = 0; i < s.n; i++) mesurer(s.depart + s.pente * i + (s.amplitude ?? 0) * Math.sin((s.pulsation ?? 0) * i));
    } else {
      t += PAS_MS;
      moteur.resolve(ids[etape.resoudre - 1] ?? '', t);
    }
    // Numérotation au fil de l'eau : l'alarme à clore à la main doit déjà être connue.
    for (const e of emis) if (!ids.includes(e.a.id)) ids.push(e.a.id);
  }
  const evenements = emis.map((e) => ({ ...e.a, type: e.kind, alarme: ids.indexOf(e.a.id) + 1 }) as Record<string, unknown>);
  return { niveaux, evenements };
}

/** L'événement obtenu ramené aux champs attendus ; un nombre assez proche prend la valeur attendue, pour un écart lisible. */
function projeter(obtenu: Record<string, unknown>, attendu: Attendu): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  for (const [champ, valeur] of Object.entries(attendu)) {
    const v = obtenu[champ] ?? null;
    const proche = typeof valeur === 'number' && typeof v === 'number' && Math.abs(valeur - v) <= TOLERANCE * Math.max(1, Math.abs(valeur));
    p[champ] = proche ? valeur : v;
  }
  return p;
}

describe('moteur de règles (cas communs front = back)', () => {
  it('classe une valeur selon ses seuils', () => {
    for (const { v, seuils, niveau } of FICHIER.classement) expect(classify(v, seuils ?? FICHIER.point.seuils), `${v}`).toBe(niveau);
  });

  for (const c of FICHIER.cas) {
    it(c.nom, () => {
      const { niveaux, evenements } = jouer(c);
      if (c.niveaux) expect(niveaux).toEqual(c.niveaux);
      expect(evenements.map((e, i) => (c.evenements[i] ? projeter(e, c.evenements[i]) : e))).toEqual(c.evenements);
    });
  }
});
