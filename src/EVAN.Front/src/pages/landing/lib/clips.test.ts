import { describe, expect, it } from 'vitest';
import { CLIPS, imageDebut, imageFin, video } from './clips';

describe('vidéos de « Comment ça marche »', () => {
  it('donnent la version de nuit par défaut', () => {
    expect(video(CLIPS[6])).toBe('/parcours/6-supervision.mp4');
    expect(imageDebut(CLIPS[6])).toBe('/parcours/6-supervision-debut.webp');
    expect(imageFin(CLIPS[6])).toBe('/parcours/6-supervision-fin.webp');
  });

  it('donnent la version de jour quand la page est en thème jour', () => {
    expect(video(CLIPS[1], true)).toBe('/parcours/1-localiser-jour.mp4');
    expect(imageDebut(CLIPS[1], true)).toBe('/parcours/1-localiser-jour-debut.webp');
    expect(imageFin(CLIPS[1], true)).toBe('/parcours/1-localiser-jour-fin.webp');
  });

  it('couvrent les sept étapes du parcours', () => {
    expect(Object.keys(CLIPS).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});
