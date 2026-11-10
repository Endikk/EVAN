import { Check } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useProject } from '@/store/project';
import { CONFIG_STEPS } from './steps';
import { goToStep } from './navigation';
import { stopTour } from '@/widgets/tour/tour';

/**
 * Les cinq étapes de configuration, dans la barre latérale quand la configuration est ouverte. Le fil se remplit
 * jusqu'à l'étape en cours ; l'étape en cours dit en clair ce qu'on y fait. « Terminer » est dans la barre du haut.
 */
export function EtapesConfig({ apres }: { apres?: () => void }) {
  const step = useUi((s) => s.step);
  const hasBuilding = useProject((s) => s.batiments.length > 0);
  const faites = Math.min(CONFIG_STEPS.length, Math.max(0, step - 1));
  return (
    <section className="side-section side-etapes" aria-labelledby="side-etapes-titre" style={{ ['--avance' as string]: faites / (CONFIG_STEPS.length - 1) }}>
      <div className="side-section-tete">
        <h2 id="side-etapes-titre">Configurer l’usine</h2>
        <span className="side-compte num" title={`${faites} étapes faites sur ${CONFIG_STEPS.length}`}>
          {faites} sur {CONFIG_STEPS.length}
        </span>
      </div>
      <ol className="rail-steps">
        {CONFIG_STEPS.map((s) => {
          const Icon = s.icon;
          const done = s.n < step;
          const courant = s.n === step;
          return (
            <li key={s.n}>
              <button
                className={`rail-step ${done ? 'done' : ''}`}
                aria-current={courant ? 'step' : undefined}
                disabled={s.n > 1 && !hasBuilding}
                onClick={() => {
                  apres?.();
                  stopTour();
                  void goToStep(s.n, { force: true });
                }}
                title={`${s.n}. ${s.titre} : ${s.action}`}
              >
                <span className="n">{done ? <Check className="rail-check" /> : <Icon />}</span>
                <span className="txt">
                  <b>
                    {s.n}. {s.titre}
                  </b>
                  {/* Ce qu'on fait, pour l'étape en cours seulement : la liste reste courte. */}
                  {courant && <small>{s.action}</small>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
