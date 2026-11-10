import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FIN, FPS, bezier, canaux, ressort, type Canaux } from './timeline';
import { variables, type Mesures } from './geometrie';
import timing from './timing.json';
import facts from './facts.json';
import { PRESSE, VUES } from '../lib/sections';

const R = timing.reperes as unknown as Record<string, number | [number, number]>;
const depot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const numeriques = (c: Canaux) => Object.entries(c).filter((e): e is [string, number] => typeof e[1] === 'number');

describe('courbes', () => {
  it('une courbe de Bézier vaut 0 et 1 aux bornes et suit cubic-bezier()', () => {
    const e = bezier(0.42, 0, 0.58, 1);
    expect(e(0)).toBe(0);
    expect(e(1)).toBe(1);
    expect(e(0.5)).toBeCloseTo(0.5, 4);
    expect(bezier(0, 0, 1, 1)(0.3)).toBeCloseTo(0.3, 4);
  });

  it('le ressort dépasse sa cible puis s’y pose exactement', () => {
    const max = Math.max(...Array.from({ length: 100 }, (_, i) => ressort(i / 100)));
    expect(max).toBeGreaterThan(1);
    expect(ressort(1)).toBe(1);
  });
});

describe('film d’ouverture', () => {
  it('dure 5,5 s à 60 i/s, sur une grille de 30 images par temps', () => {
    expect(FPS).toBe(60);
    expect(FIN).toBe(330);
    expect((R.impact as number) % 30).toBe(0);
    expect(FIN % 30).toBe(0);
  });

  it('la première image montre la presse, de près, en train de s’allumer', () => {
    const c = canaux(0);
    expect(c.travelling).toBe(0);
    expect(c.allumee).toBe(false);
    expect(c.phase).toBe('travelling');
  });

  it('aucun canal ne saute d’une image à la suivante', () => {
    for (let f = 0; f < FIN; f += 0.25) {
      const a = Object.fromEntries(numeriques(canaux(f)));
      for (const [k, v] of numeriques(canaux(f + 0.25))) expect(Math.abs(v - a[k]), `${k} à l’image ${f}`).toBeLessThan(0.12);
    }
  });

  it('la presse est entièrement allumée quand la lumière touche le dernier rouleau, et le recul commence alors', () => {
    expect(canaux((R.impact as number) - 1).allumee).toBe(false);
    expect(canaux(R.impact as number).allumee).toBe(true);
    expect(canaux(R.impact as number).recul).toBe(0);
    expect(canaux((R.recul as [number, number])[1]).recul).toBe(1);
  });

  it('la dernière image est la page au repos', () => {
    const c = canaux(FIN);
    expect(c).toMatchObject({ allumee: true, recul: 1, facteur: 1, pointVert: true, pointVu: false, nuage: 1, voile: 0 });
    expect(c).toMatchObject({ ligne1: 1, ligne2: 1, carte: 1, phrase: 1, actions: 1, puces: 1, phase: 'fin' });
  });
});

describe('géométrie du film', () => {
  const m: Mesures = {
    scene: { x: 0, y: 0, w: 1728, h: 936 },
    point: { x: 640, y: 720, r: 5 },
    puce: { x: 960, y: 850, w: 180, h: 38 },
    carte: { x: 1400, y: 60, w: 248, h: 110 },
    pastille: { w: 150, h: 30, consigne: 24 },
  };
  const a = { rouleau: { x: 1300, y: 460 }, point: { x: 1300, y: 460 }, pin: null };

  it('le point d’état part du moyeu du dernier rouleau et se pose exactement sur le point du titre', () => {
    const [v0, v1] = R.pointVol as [number, number];
    expect(variables(canaux(v0), m, a)['--f-point']).toBe('translate(1300px, 460px)');
    expect(variables(canaux(v1 - 0.001), m, a)['--f-point']).toBe('translate(640px, 720px)');
    expect(variables(canaux(v1), m, a)['--f-point-vert']).toBe('1');
  });

  it('la lumière disparaît derrière la carte quand son trajet la croise', () => {
    const dessus = { ...m, carte: { x: 1250, y: 400, w: 200, h: 120 } };
    expect(variables(canaux(R.impact as number), dessus, a)['--f-point-vu']).toBe('0.0000');
    expect(variables(canaux(R.impact as number), m, a)['--f-point-vu']).toBe('1.0000');
  });
});

describe('faits', () => {
  const plat = (s: string) => s.replace(/\s+/g, '');

  it('chaque extrait cité est bien dans le fichier indiqué', () => {
    for (const e of [...facts.textes, ...facts.images]) {
      const contenu = plat(readFileSync(resolve(depot, e.url), 'utf8'));
      expect(contenu.includes(plat(e.source)), `${e.url} : ${e.source}`).toBe(true);
    }
  });

  it('chaque texte affiché par le film est dans facts.json', () => {
    const textes = new Set(facts.textes.map((t) => t.texte));
    const film = [
      String(PRESSE.vitesse.nominale),
      PRESSE.vitesse.unite,
      ...VUES.map((v) => v.label),
      'Voir sur la presse',
      'Toute votre usine.',
      'Jusqu’au dernier rouleau',
      'Supervision d’usine',
      'simulation',
      'IMPRESSION FLEXO',
      'DÉCOUPE',
      '0',
      'Comment ça marche',
    ];
    for (const t of film) expect(textes.has(t), t).toBe(true);
  });

  it('les textes de la page cités dans facts.json sont ceux qu’elle affiche', () => {
    const page = readFileSync(resolve(depot, 'src/EVAN.Front/src/pages/landing/index.tsx'), 'utf8');
    for (const t of ['Toute votre usine.', 'Jusqu’au dernier rouleau', 'Supervision d’usine', facts.textes[3].texte]) expect(page.includes(t), t).toBe(true);
  });
});
