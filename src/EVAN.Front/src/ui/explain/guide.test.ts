import { describe, expect, it } from 'vitest';
import { choisirBloc } from './Guide';
import { placerBulle } from './useBulle';

describe('« Montrer » un bloc de l’écran', () => {
  it('désigne le bloc visible, pas la carte satellite cachée sous l’écran qui porte la même clé', () => {
    const carteCachee = { nom: 'carte satellite', cache: true };
    const carteDesArrets = { nom: 'carte des arrêts', cache: false };
    expect(choisirBloc([carteCachee, carteDesArrets])?.nom).toBe('carte des arrêts');
  });

  it('ne désigne rien si aucun bloc ne se voit', () => {
    expect(choisirBloc([{ cache: true }])).toBeUndefined();
  });
});

describe('bulle d’un mot du métier', () => {
  const ecran = { largeur: 1440, hauteur: 900 };

  it('se place sous son mot, sans déborder de l’écran', () => {
    expect(placerBulle({ left: 1420, width: 40, top: 100, bottom: 120 }, 300, ecran)).toEqual({ left: 1132, top: 126 });
  });

  it('passe au-dessus du mot en bas d’écran', () => {
    expect(placerBulle({ left: 100, width: 40, top: 800, bottom: 820 }, 300, ecran)).toEqual({ left: 8, bottom: 106 });
  });

  it('se ferme quand son mot sort de l’écran au défilement', () => {
    expect(placerBulle({ left: 100, width: 40, top: -60, bottom: -40 }, 300, ecran)).toBeUndefined();
  });
});
