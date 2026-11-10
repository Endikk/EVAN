import { describe, expect, it } from 'vitest';
import { lirePrecision, phaseAccueil, verdictAnnonce, type EtatAccueil } from './verdicts';

const vierge: EtatAccueil = {
  aSite: false,
  nbBatiments: 0,
  dessin: false,
  cherche: false,
  releve: false,
  nbCandidats: 0,
  erreur: false,
  saisie: false,
};

describe('phaseAccueil', () => {
  it('invite à taper l’adresse quand l’usine est vierge', () => {
    expect(phaseAccueil(vierge)).toBe('adresse');
  });

  it('s’efface pendant la saisie, sauf si EVAN travaille', () => {
    expect(phaseAccueil({ ...vierge, saisie: true })).toBeNull();
    expect(phaseAccueil({ ...vierge, saisie: true, cherche: true })).toBe('cherche');
  });

  it('demande de choisir parmi les bâtiments proposés, ou de cliquer s’il n’y en a pas', () => {
    expect(phaseAccueil({ ...vierge, aSite: true, nbCandidats: 3 })).toBe('choisir');
    expect(phaseAccueil({ ...vierge, aSite: true })).toBe('cliquer');
  });

  it('se tait une fois un bâtiment retenu, sauf pendant un tracé à la main', () => {
    expect(phaseAccueil({ ...vierge, aSite: true, nbBatiments: 1 })).toBeNull();
    expect(phaseAccueil({ ...vierge, aSite: true, nbBatiments: 1, dessin: true })).toBe('dessin');
  });

  it('montre l’erreur quand la recherche des bâtiments a échoué', () => {
    expect(phaseAccueil({ ...vierge, aSite: true, erreur: true })).toBe('erreur');
  });
});

describe('verdictAnnonce', () => {
  it('ne dit rien sans surface annoncée', () => {
    expect(verdictAnnonce(5000, undefined)).toBeNull();
    expect(verdictAnnonce(5000, 0)).toBeNull();
  });

  it('rassure quand l’écart est faible', () => {
    expect(verdictAnnonce(6971, 7000)?.ton).toBe('ok');
  });

  it('signale un bâtiment manquant quand le relevé est bien plus petit', () => {
    const v = verdictAnnonce(4000, 7000);
    expect(v?.ton).toBe('warn');
    expect(v?.texte).toContain('manque');
  });

  it('signale un bâtiment en trop quand le relevé est bien plus grand', () => {
    expect(verdictAnnonce(9000, 7000)?.texte).toContain('par erreur');
  });
});

describe('lirePrecision', () => {
  it('donne la fourchette à un écart-type', () => {
    const p = lirePrecision(5958, 184);
    expect(p.fourchette).toContain('5');
    expect(p.pourcent).toBe('3,1 %');
  });
});
