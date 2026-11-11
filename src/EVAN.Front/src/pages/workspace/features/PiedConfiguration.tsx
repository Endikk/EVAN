/**
 * Pied du panneau de configuration : revenir à l'étape précédente, passer à la suivante, ou terminer à la dernière.
 *
 * Une seule action vermillon à la fois : tant qu'il reste une tâche obligatoire à l'étape (la liste « À faire ici »),
 * c'est elle qui mène (« Le contour est juste » à l'étape 1) et « Suivant » reste secondaire. Grisé, « Suivant » dit
 * pourquoi, en clair sous les boutons.
 */
import { useId } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useTachesConfig, type EtapeConfig, type TachesConfig } from '@/store/avancement';
import type { Step } from '@/store/ui';
import { finishConfiguration, goToStep } from '@/widgets/shell/navigation';
import { CONFIG_STEPS } from '@/widgets/shell/steps';
import { stopTour } from '@/widgets/tour/tour';

export interface EtatPied {
  /** « Étape précédente » s'affiche (pas à la première étape). */
  precedente: boolean;
  /** Pourquoi « Suivant » est grisé, ou rien s'il est actif. */
  bloque?: string;
  /** « Suivant » est l'action principale : plus rien d'obligatoire à faire à l'étape. */
  principal: boolean;
}

export function etatPied(step: EtapeConfig, taches: TachesConfig, avecBatiment: boolean): EtatPied {
  const resteAFaire = Object.values(taches[step]).some((fait) => fait === false);
  return {
    precedente: step > 1,
    bloque: avecBatiment ? undefined : 'Choisissez d’abord le bâtiment de l’usine sur la carte.',
    principal: avecBatiment && !resteAFaire,
  };
}

export function PiedConfiguration({ step, avecBatiment }: { step: EtapeConfig; avecBatiment: boolean }) {
  const taches = useTachesConfig();
  const raisonId = useId();
  const { precedente, bloque, principal } = etatPied(step, taches, avecBatiment);
  const classe = `btn sm ${principal ? 'primary' : ''}`;
  return (
    <div className="panel-foot">
      <div className="panel-foot-actions">
        {precedente && (
          <button className="btn sm ghost" onClick={() => (stopTour(), void goToStep((step - 1) as Step, { force: true }))}>
            <ArrowLeft /> Étape précédente
          </button>
        )}
        {step < 5 ? (
          <button className={classe} disabled={!!bloque} aria-describedby={bloque ? raisonId : undefined} onClick={() => (stopTour(), void goToStep((step + 1) as Step, { force: true }))}>
            Suivant : {CONFIG_STEPS[step]?.titre} <ArrowRight />
          </button>
        ) : (
          <button className={classe} disabled={!!bloque} aria-describedby={bloque ? raisonId : undefined} onClick={() => (stopTour(), void finishConfiguration())}>
            <CheckCircle2 /> Terminer la configuration
          </button>
        )}
      </div>
      {bloque && (
        <p id={raisonId} className="panel-foot-raison">
          {bloque}
        </p>
      )}
    </div>
  );
}
