/**
 * La chaîne de détection racontée en quatre temps, pour quelqu'un qui n'a jamais vu un automate : le capteur mesure,
 * la valeur passe sa limite, EVAN déclenche l'alarme, l'écran prévient. Chaque temps tient en deux lignes courtes : ce
 * qui s'est passé, et le fait mesuré (la valeur, la limite, le code, le délai). L'explication de la méthode est dans
 * le « ? » du bloc ; les dix maillons techniques (automate, passerelle, messages…) restent à part, repliés.
 */
import type { Alarme } from '@/domain/types';
import type { DetectionTrace, EtapeTrace } from '@/store/live';
import { fmtValue } from '@/ui/format';

export type CleEtape = 'mesure' | 'limite' | 'alarme' | 'ecran';

export interface EtapeDetection {
  cle: CleEtape;
  /** Le maillon correspondant est arrivé. */
  fait: boolean;
  /** Ce qui s'est passé, en quelques mots. */
  titre: string;
  /** Le fait mesuré, avec les vraies valeurs. */
  valeur?: string;
  /** Ce qui va se passer, tant que le temps n'est pas encore atteint (ou pas encore allumé à l'écran). */
  titreAttente: string;
}

export interface ContexteDetection {
  numero: string;
  /** Nom du point de mesure en cause (« Étiquettes manquantes »). */
  mesure?: string;
  /** Signal tout ou rien de l'automate : il n'y a pas de valeur à comparer à une limite. */
  discret?: boolean;
}

const MS_PAR_S = 1000;

/** Délai entre la mesure et l'écran, en secondes : « 0,3 s », « 1,2 s ». */
function delai(ms: number): string {
  return `${(ms / MS_PAR_S).toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: ms < MS_PAR_S ? 1 : 0 })} s`;
}

function etapeLimite(a: Alarme | undefined): { titre: string; valeur?: string } {
  if (!a) return { titre: 'Limite franchie' };
  if (a.regle === 'automate') return { titre: 'Signal de l’automate', valeur: 'Pas de limite à calculer' };
  if (a.regle === 'derive') return { titre: 'Glisse vers sa limite', valeur: a.seuil !== undefined ? `Limite : ${fmtValue(a.seuil, a.unite)}` : undefined };
  const quelle = a.gravite === 'critique' ? 'Limite d’alarme' : 'Limite d’attention';
  const faits = [a.seuil !== undefined ? `${quelle} : ${fmtValue(a.seuil, a.unite)}` : '', a.regle === 'repetitif' && a.repetitions ? `${a.repetitions}ᵉ fois` : ''].filter(Boolean);
  return { titre: 'Limite franchie', valeur: faits.length ? faits.join(', ') : undefined };
}

function valeurMesure(alarme: Alarme | undefined, c: ContexteDetection): string | undefined {
  const mesure = c.mesure ?? 'Mesure';
  if (c.discret) return `${mesure} : signal d’alarme`;
  if (alarme?.valeur !== undefined) return `${mesure} : ${fmtValue(alarme.valeur, alarme.unite)}`;
  return c.mesure;
}

/** Les quatre temps de la détection, chacun « fait » dès que le maillon correspondant est arrivé. */
export function etapesDetection(trace: DetectionTrace, alarme: Alarme | undefined, c: ContexteDetection): EtapeDetection[] {
  const a = (e: EtapeTrace) => trace.steps.some((s) => s.etape === e);
  const limite = etapeLimite(alarme);
  const latence = trace.latence;

  return [
    { cle: 'mesure', fait: a('capteur'), titre: 'Mesure relevée', valeur: valeurMesure(alarme, c), titreAttente: 'Le capteur mesure' },
    { cle: 'limite', fait: a('regles'), titre: limite.titre, valeur: limite.valeur, titreAttente: 'Dans ses limites ?' },
    {
      cle: 'alarme',
      fait: a('alarme'),
      titre: 'Alarme déclenchée',
      valeur: alarme ? `${alarme.code} · ${c.numero} en panne` : `${c.numero} en panne`,
      titreAttente: 'EVAN déclenche l’alarme',
    },
    { cle: 'ecran', fait: a('ecran'), titre: 'Vous êtes prévenu', valeur: latence !== undefined ? `En ${delai(latence)} après la mesure` : 'Aussitôt', titreAttente: 'L’écran vous prévient' },
  ];
}

/** L'alarme qui correspond à la trace : la plus grave levée sur cet organe depuis le début du défaut. */
export function alarmeDeLaTrace(trace: DetectionTrace, alarms: Alarme[]): Alarme | undefined {
  const candidates = alarms.filter((x) => x.machineId === trace.machineId && x.organeId === trace.organeId && x.horodatage >= trace.debut - MS_PAR_S);
  return (
    candidates.find((x) => x.gravite === 'critique' && (!trace.code || x.code === trace.code)) ??
    candidates.find((x) => x.gravite === 'critique') ??
    candidates.find((x) => x.statut !== 'resolue') ??
    candidates[0]
  );
}
