/**
 * Réglages du calcul de l'énergie (prix du kWh, facteur d'émission), propres à chaque usine. Ils survivent au
 * changement d'écran (le store vit hors de l'écran) et au rechargement (le dernier réglage valable de chaque usine est
 * gardé dans ce navigateur). Une saisie en cours, même fausse, reste affichée tant qu'on ne quitte pas l'application ;
 * seul ce qui se lit correctement est retenu.
 *
 * La lecture refuse ce qui donnerait un écran faux sans le dire : un prix nul (tous les euros à zéro) ou un prix au
 * MWh tapé dans la case du kWh (150 au lieu de 0,15, tous les montants mille fois trop grands).
 */
import { create } from 'zustand';
import { ENERGIE_DEFAUT } from '@/domain/catalog';

export interface SaisieReglages {
  prix: string;
  facteurG: string;
}

/** Un nombre à la française, pour remplir un champ : « 0,15 ». */
const enTexte = (v: number) => String(v).replace('.', ',');

export const REGLAGES_DEFAUT: SaisieReglages = {
  prix: enTexte(ENERGIE_DEFAUT.prixKwh),
  facteurG: String(Math.round(ENERGIE_DEFAUT.facteurCo2 * 1000)),
};

/** Au-delà, c'est presque sûrement un prix au MWh : aucun contrat ne facture le kWh plus de 2 €. */
export const PRIX_MAX = 2;
/** Au-delà, c'est presque sûrement une autre unité : même le charbon émet autour de 1 000 g par kWh. */
export const FACTEUR_MAX_G = 2000;

/** Nombre saisi à la française (« 0,15 », « 1 200 ») ; undefined s'il n'est pas lisible ou négatif. */
export function lireNombre(s: string): number | undefined {
  const t = s.replace(/\s/g, '').replace(',', '.');
  if (!t) return undefined;
  const v = Number(t);
  return Number.isFinite(v) && v >= 0 ? v : undefined;
}

/** Une saisie lue : sa valeur si elle est bonne, sinon ce qui ne va pas, dit pour la personne qui tape. */
export type Lecture = { valeur: number; erreur?: undefined } | { valeur?: undefined; erreur: string };

export function lirePrix(s: string): Lecture {
  const v = lireNombre(s);
  if (v === undefined) return { erreur: 'Entrez un prix positif, par exemple 0,15.' };
  if (v === 0) return { erreur: 'À 0 €, tous les montants de l’écran seraient nuls. Entrez le prix de votre contrat, par exemple 0,15.' };
  if (v > PRIX_MAX) return { erreur: `Plus de ${PRIX_MAX} € le kWh : c’est sans doute un prix au MWh. 150 € le MWh font 0,15 € le kWh.` };
  return { valeur: v };
}

export function lireFacteur(s: string): Lecture {
  const v = lireNombre(s);
  if (v === undefined) return { erreur: 'Entrez un nombre positif, par exemple 40.' };
  if (v > FACTEUR_MAX_G)
    return { erreur: `Plus de ${new Intl.NumberFormat('fr-FR').format(FACTEUR_MAX_G)} g par kWh : vérifiez l’unité, ce sont des grammes de CO₂e par kWh.` };
  return { valeur: v };
}

/** Les paramètres du calcul : la saisie si elle est bonne, sinon le dernier réglage retenu, sinon le défaut. */
export function parametres(saisie: SaisieReglages, retenu: SaisieReglages = REGLAGES_DEFAUT): { prixKwh: number; facteurCo2: number } {
  const prix = lirePrix(saisie.prix).valeur ?? lirePrix(retenu.prix).valeur ?? ENERGIE_DEFAUT.prixKwh;
  const g = lireFacteur(saisie.facteurG).valeur ?? lireFacteur(retenu.facteurG).valeur ?? ENERGIE_DEFAUT.facteurCo2 * 1000;
  return { prixKwh: prix, facteurCo2: g / 1000 };
}

const CLE = 'evan.energie.reglages';

function lireRetenus(): Record<string, SaisieReglages> {
  try {
    const brut: unknown = JSON.parse(localStorage.getItem(CLE) ?? '{}');
    if (!brut || typeof brut !== 'object') return {};
    const out: Record<string, SaisieReglages> = {};
    for (const [id, r] of Object.entries(brut as Record<string, Partial<SaisieReglages>>)) {
      // Un réglage abîmé ou d'une ancienne version ne passe pas : on retombe sur le défaut, champ par champ.
      out[id] = {
        prix: typeof r?.prix === 'string' && lirePrix(r.prix).valeur !== undefined ? r.prix : REGLAGES_DEFAUT.prix,
        facteurG: typeof r?.facteurG === 'string' && lireFacteur(r.facteurG).valeur !== undefined ? r.facteurG : REGLAGES_DEFAUT.facteurG,
      };
    }
    return out;
  } catch {
    return {};
  }
}

interface ReglagesEnergie {
  /** Ce qui est tapé, usine par usine, le temps de la session. */
  saisies: Record<string, SaisieReglages>;
  /** Le dernier réglage valable de chaque usine, gardé dans ce navigateur. */
  retenus: Record<string, SaisieReglages>;
  regler(usineId: string, saisie: SaisieReglages): void;
}

export const useReglagesEnergie = create<ReglagesEnergie>()((set, get) => ({
  saisies: {},
  retenus: lireRetenus(),
  regler: (usineId, saisie) => {
    const avant = get().retenus[usineId] ?? REGLAGES_DEFAUT;
    const retenu: SaisieReglages = {
      prix: lirePrix(saisie.prix).valeur !== undefined ? saisie.prix : avant.prix,
      facteurG: lireFacteur(saisie.facteurG).valeur !== undefined ? saisie.facteurG : avant.facteurG,
    };
    const retenus = { ...get().retenus, [usineId]: retenu };
    set({ saisies: { ...get().saisies, [usineId]: saisie }, retenus });
    try {
      localStorage.setItem(CLE, JSON.stringify(retenus));
    } catch {
      /* navigation privée ou stockage plein : le réglage tient le temps de la session */
    }
  },
}));

/** La saisie affichée pour une usine : ce qui est tapé, sinon le dernier réglage retenu, sinon le défaut. */
export function saisieDe(s: Pick<ReglagesEnergie, 'saisies' | 'retenus'>, usineId: string): SaisieReglages {
  return s.saisies[usineId] ?? s.retenus[usineId] ?? REGLAGES_DEFAUT;
}
