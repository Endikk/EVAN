/**
 * Défaut répétitif → pièce tournante en cause.
 *
 * Un cylindre ou un rouleau abîmé laisse une marque à chaque tour : sur la bande, le défaut revient à un pas égal à sa
 * circonférence (son « développement »). On compare le pas mesuré aux circonférences de toutes les pièces tournantes
 * de la machine, comme le font les systèmes d'inspection de bande avec leur table des circonférences.
 * Plusieurs pièces peuvent avoir le même développement (cylindre porte-cliché et cylindre magnétique d'une presse
 * étiquettes) : l'aspect du défaut (impression, découpe, marque) les départage.
 *
 * Même logique que src/EVAN.Core/Domain/Diagnostics/RepeatDefect.cs ; cas de test communs : data/tests/defaut-repetitif.json.
 */
import type { CylindreDef, NatureDefaut } from '@/domain/catalog';

export const NATURE_DEFAUT_LIBELLE: Record<NatureDefaut, string> = {
  impression: 'Défaut d’impression : manque, tache, voile',
  decoupe: 'Défaut de découpe : coupe incomplète, bavure',
  marque: 'Marque, rayure ou pli sur la matière',
  dorure: 'Défaut de dorure',
};

/** Tolérance par défaut (relative) : mesure du pas à ±1 mm, glissement et allongement de la bande. */
export const TOLERANCE_PAS = 0.015;

/** Écart relatif sous lequel deux pièces ont « le même développement ». */
const MEME_DEVELOPPEMENT = 0.002;

/**
 * Rapports pas / circonférence examinés : une marque par tour (le cas normal), une marque sur deux (défaut
 * intermittent) ou deux marques par tour (deux poses en développement, deux points abîmés). Les deux derniers sont
 * moins probables et jugés avec une tolérance plus stricte.
 */
const RAPPORTS: { rapport: 1 | 2 | 0.5; poids: number; tolerance: number }[] = [
  { rapport: 1, poids: 1, tolerance: 1 },
  { rapport: 2, poids: 0.45, tolerance: 0.6 },
  { rapport: 0.5, poids: 0.4, tolerance: 0.6 },
];

/** Une nature de défaut différente de celle de la pièce ne l'exclut pas, mais la rend bien moins probable. */
const AUTRE_NATURE = 0.35;

export function circonference(c: CylindreDef): number {
  return c.developpement ?? Math.PI * (c.diametre ?? 0);
}

/** Pas en mm d'un défaut qui revient toutes les `n` étiquettes. */
export function pasDepuisEtiquettes(n: number, pasEtiquetteMm: number): number {
  return n * pasEtiquetteMm;
}

export interface OrganeCylindres {
  numero: number;
  nom: string;
  cylindres: CylindreDef[];
}

export interface CandidatPas {
  organeNumero: number;
  organeNom: string;
  cylindre: string;
  nature: NatureDefaut;
  /** Circonférence de la pièce (mm). */
  circonference: number;
  /** Pas / circonférence : 1 = une marque par tour, 2 = une sur deux, 0,5 = deux par tour. */
  rapport: 1 | 2 | 0.5;
  /** Pas attendu pour ce rapport (mm). */
  pasTheorique: number;
  /** Pas mesuré − pas attendu (mm). */
  ecartMm: number;
  /** Écart relatif (fraction). */
  ecartRelatif: number;
  /** Vraisemblance de 0 à 1. */
  score: number;
  confiance: 'forte' | 'moyenne' | 'faible';
  /** Autres pièces de même développement, à départager par l'aspect du défaut. */
  memeDeveloppement: string[];
}

export interface DiagnosticPas {
  pas: number;
  tolerance: number;
  nature?: NatureDefaut;
  candidats: CandidatPas[];
}

const arrondi = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function diagnostiquerPas(
  organes: OrganeCylindres[],
  pas: number,
  opts: { tolerance?: number; nature?: NatureDefaut } = {},
): DiagnosticPas {
  const tolerance = opts.tolerance ?? TOLERANCE_PAS;
  const out: CandidatPas[] = [];
  if (!(pas > 0)) return { pas, tolerance, nature: opts.nature, candidats: out };
  const pieces = organes.flatMap((o) => o.cylindres.map((c) => ({ o, c, C: circonference(c) })));

  for (const { o, c, C } of pieces) {
    if (!(C > 0)) continue;
    for (const r of RAPPORTS) {
      const theorique = C * r.rapport;
      const ecart = Math.abs(pas - theorique) / theorique;
      const tol = tolerance * r.tolerance;
      if (ecart > tol) continue;
      const accord = !opts.nature || opts.nature === c.nature ? 1 : AUTRE_NATURE;
      const score = (1 - ecart / tol) * r.poids * accord;
      const confiance = r.rapport === 1 && ecart <= tolerance / 3 && accord === 1 ? 'forte' : score >= 0.4 ? 'moyenne' : 'faible';
      out.push({
        organeNumero: o.numero,
        organeNom: o.nom,
        cylindre: c.nom,
        nature: c.nature,
        circonference: arrondi(C, 1),
        rapport: r.rapport,
        pasTheorique: arrondi(theorique, 1),
        ecartMm: arrondi(pas - theorique, 1),
        ecartRelatif: arrondi(ecart, 4),
        score: arrondi(score, 3),
        confiance,
        memeDeveloppement: pieces.filter((p) => p.c !== c && Math.abs(p.C - C) / C <= MEME_DEVELOPPEMENT).map((p) => p.c.nom),
      });
    }
  }
  out.sort((a, b) => b.score - a.score || a.ecartRelatif - b.ecartRelatif);
  return { pas, tolerance, nature: opts.nature, candidats: out };
}
