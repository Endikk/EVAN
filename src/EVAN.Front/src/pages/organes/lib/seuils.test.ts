import { describe, expect, it } from 'vitest';
import { bandeSeuils, lectureSeuils, position } from './seuils';

const plages = (b: ReturnType<typeof bandeSeuils>) => b?.segments.map((s) => s.plage);

describe('bande des seuils', () => {
  it('sans seuil, pas de bande', () => {
    expect(bandeSeuils({}, 590)).toBeNull();
  });

  it('quatre seuils : alarme, attention, normal, attention, alarme', () => {
    const b = bandeSeuils({ alarmeBas: 120, attentionBas: 150, attentionHaut: 212, alarmeHaut: 235 }, 180);
    expect(plages(b)).toEqual(['alarme', 'attention', 'normal', 'attention', 'alarme']);
    // Les segments couvrent toute la bande, bout à bout.
    expect(b!.segments[0].x0).toBe(0);
    expect(b!.segments.at(-1)!.x1).toBeCloseTo(1);
    for (let i = 1; i < b!.segments.length; i++) expect(b!.segments[i].x0).toBeCloseTo(b!.segments[i - 1].x1);
  });

  it('seuils hauts seulement : normal, attention, alarme', () => {
    expect(plages(bandeSeuils({ attentionHaut: 75, alarmeHaut: 90 }, 36))).toEqual(['normal', 'attention', 'alarme']);
  });

  it('seuils bas seulement (une bobine qui se vide) : alarme, attention, normal, sans passer sous zéro', () => {
    const b = bandeSeuils({ attentionBas: 140, alarmeBas: 90 }, 640);
    expect(plages(b)).toEqual(['alarme', 'attention', 'normal']);
    expect(b!.min).toBe(0);
  });

  it('une mesure qui peut être négative garde sa marge sous zéro', () => {
    const b = bandeSeuils({ alarmeBas: -3, attentionBas: -1.5, attentionHaut: 1.5, alarmeHaut: 3 }, 0);
    expect(b!.min).toBeLessThan(-3);
    expect(position(b!, 0)).toBeCloseTo(0.5);
  });

  it('des seuils saisis dans le désordre ne produisent pas de segment à l’envers', () => {
    const b = bandeSeuils({ attentionBas: 200, attentionHaut: 150 }, 180);
    for (const s of b!.segments) expect(s.x1).toBeGreaterThan(s.x0);
  });

  it('une valeur hors bande reste collée au bord', () => {
    const b = bandeSeuils({ attentionHaut: 75, alarmeHaut: 90 }, 36)!;
    expect(position(b, 1000)).toBe(1);
    expect(position(b, -1000)).toBe(0);
  });
});

describe('lecture des seuils', () => {
  it('dit la plage normale, puis l’attention, puis l’alarme', () => {
    expect(lectureSeuils({ alarmeBas: 120, attentionBas: 150, attentionHaut: 212, alarmeHaut: 235 }, 'N')).toBe(
      'Normal entre 150 N et 212 N. Attention sous 150 N ou au-dessus de 212 N. Alarme sous 120 N ou au-dessus de 235 N.',
    );
  });

  it('seuils bas seulement', () => {
    expect(lectureSeuils({ attentionBas: 140, alarmeBas: 90 }, 'mm')).toBe('Normal au-dessus de 140 mm. Attention sous 140 mm. Alarme sous 90 mm.');
  });
});
