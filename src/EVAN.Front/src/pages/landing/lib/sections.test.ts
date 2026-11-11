import { describe, expect, it } from 'vitest';
import { CODE_PANNE, PIECES, annonceVue, numeroPiece } from './sections';

describe('contenu de l’accueil', () => {
  it('liste les pièces de la presse dans l’ordre de leur numéro, sous leur nom court', () => {
    expect(PIECES.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(PIECES[0]).toEqual({ numero: 1, nom: 'Dérouleur' });
    expect(PIECES.find((p) => p.numero === 2)?.nom).toBe('Groupe flexo');
  });

  it('numérote les pièces sur deux chiffres, comme sur la presse', () => {
    expect(numeroPiece(1)).toBe('01');
    expect(numeroPiece(12)).toBe('12');
  });

  it('annonce la panne, la pièce en cause et ce qu’il faut vérifier', () => {
    expect(annonceVue('panne')).toBe(
      `Panne ${CODE_PANNE} provoquée : la presse s’arrête. Pièce en cause : dorure à froid. À vérifier : contrôler le passage du film.`,
    );
  });

  it('annonce les pièces surveillées une à une', () => {
    const a = annonceVue('pieces');
    expect(a.startsWith('Les 9 pièces surveillées : 1 Dérouleur, 2 Groupe flexo')).toBe(true);
    expect(a.endsWith('9 Pupitre.')).toBe(true);
  });

  it('annonce le retour à la vue d’ensemble', () => {
    expect(annonceVue('accueil')).toBe('Vue d’ensemble : la presse tourne.');
  });
});
