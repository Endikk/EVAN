import { Check } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useProject } from '@/store/project';
import { useAvancement, type EtatEtape } from '@/store/avancement';
import { TonGlyph } from '@/ui/explain';
import { CONFIG_STEPS } from './steps';
import { goToStep } from './navigation';
import { stopTour } from '@/widgets/tour/tour';

/** Ce que l'état d'une étape ajoute à son nom, pour la bulle et les lecteurs d'écran. */
const ETAT_LU: Record<EtatEtape, string> = { faite: 'faite', 'a-reprendre': 'à reprendre', 'a-faire': 'à faire' };

/**
 * Les cinq étapes de configuration, dans la barre latérale quand la configuration est ouverte. Le fil se remplit
 * jusqu'à l'étape en cours. Le rail ne dit que le nom de chaque étape : ce qu'on fait dans l'étape en cours est le
 * titre du panneau, et sa position (« Étape 2 sur 5 ») la barre du haut ; les répéter ici faisait trois fois la même
 * information à l'écran. « Terminer » est dans la barre du haut.
 *
 * Une étape se coche quand ses tâches obligatoires sont faites (store/avancement.ts, le calcul que lit aussi la barre de
 * progression), pas parce qu'on l'a dépassée. Commencée ou laissée derrière soi sans être finie, son rond porte un
 * triangle ambre « à reprendre » à la place de son icône.
 */
export function EtapesConfig({ apres }: { apres?: () => void }) {
  const step = useUi((s) => s.step);
  const hasBuilding = useProject((s) => s.batiments.length > 0);
  const etats = useAvancement();
  // Le fil dit où l'on est (la position de l'étape en cours), les coches disent ce qui est fait.
  const position = Math.min(CONFIG_STEPS.length, Math.max(0, step - 1));
  return (
    <section className="side-section side-etapes" aria-labelledby="side-etapes-titre" style={{ ['--avance' as string]: position / (CONFIG_STEPS.length - 1) }}>
      <div className="side-section-tete">
        <h2 id="side-etapes-titre">Configurer l’usine</h2>
      </div>
      <ol className="rail-steps">
        {CONFIG_STEPS.map((s) => {
          const Icon = s.icon;
          const etat = etats[s.n as keyof typeof etats] ?? 'a-faire';
          const done = etat === 'faite';
          const reprendre = etat === 'a-reprendre';
          const courant = s.n === step;
          return (
            <li key={s.n}>
              <button
                className={`rail-step ${done ? 'done' : ''} ${reprendre ? 'a-reprendre' : ''}`}
                aria-current={courant ? 'step' : undefined}
                disabled={s.n > 1 && !hasBuilding}
                onClick={() => {
                  apres?.();
                  stopTour();
                  void goToStep(s.n, { force: true });
                }}
                title={`${s.n}. ${s.titre} : ${s.action} (${ETAT_LU[etat]})`}
              >
                <span className="n">{done ? <Check className="rail-check" /> : reprendre ? <TonGlyph ton="warn" /> : <Icon />}</span>
                <span className="txt">
                  <b>
                    {s.n}. {s.titre}
                    <span className="sr-only">, {ETAT_LU[etat]}</span>
                  </b>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
