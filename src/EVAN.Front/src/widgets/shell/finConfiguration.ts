/**
 * Avant de terminer la configuration : ce qui manque pour que la supervision montre quelque chose. Terminer sans
 * machine posée mène à une supervision vide ; terminer avec des machines non branchées, à des machines qui ne
 * donnent aucune valeur. EVAN le dit et propose « Terminer quand même » au lieu de bloquer.
 */
import type { Connexion, Machine } from '@/domain/types';

export interface BilanFin {
  titre: string;
  texte: string;
}

/** Rien à signaler : undefined. Sinon le titre et le texte de l'avis qui précède la fin de la configuration. */
export function bilanFinConfiguration(machines: Pick<Machine, 'id'>[], connexions: Record<string, Pick<Connexion, 'etat'> | undefined>): BilanFin | undefined {
  if (machines.length === 0) {
    return {
      titre: '0 machine posée',
      texte: 'La supervision sera vide. Posez les machines à l’étape 3, ou terminez quand même et revenez-y plus tard.',
    };
  }
  const nonBranchees = machines.filter((m) => connexions[m.id]?.etat !== 'connectee').length;
  if (nonBranchees === 0) return undefined;
  const s = nonBranchees > 1 ? 's' : '';
  return {
    titre: `${nonBranchees} machine${s} sur ${machines.length} non branchée${s}`,
    texte:
      nonBranchees > 1
        ? 'Elles ne donneront aucune valeur en supervision. Branchez-les à l’étape 5, ou terminez quand même.'
        : 'Elle ne donnera aucune valeur en supervision. Branchez-la à l’étape 5, ou terminez quand même.',
  };
}
