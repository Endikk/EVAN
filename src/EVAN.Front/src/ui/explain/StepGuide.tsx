/**
 * Ce qu'il y a à faire dans une étape de configuration, sous forme de liste qui se coche toute seule
 * à mesure que c'est fait. Quand tout est coché, la liste le dit et invite à passer à la suite.
 */
import type { ReactNode } from 'react';

export interface Tache {
  label: ReactNode;
  fait: boolean;
  /** Comment faire, en une ligne, affiché tant que ce n'est pas fait. */
  aide?: ReactNode;
  /** Tâche facultative : elle ne bloque pas « tout est prêt ». */
  facultatif?: boolean;
}

function Coche({ fait }: { fait: boolean }) {
  return (
    <svg className={`coche ${fait ? 'faite' : ''}`} viewBox="0 0 20 20" width="20" height="20" aria-hidden>
      <circle className="coche-rond" cx="10" cy="10" r="8.5" />
      <path className="coche-trait" d="M6 10.4 8.7 13 14 7.4" />
    </svg>
  );
}

export function StepGuide({ taches, titre = 'À faire ici', fin = 'Tout est prêt. Vous pouvez passer à l’étape suivante.' }: { taches: Tache[]; titre?: ReactNode; fin?: ReactNode }) {
  const requises = taches.filter((t) => !t.facultatif);
  const faites = requises.filter((t) => t.fait).length;
  const fini = requises.length > 0 && faites === requises.length;
  return (
    <section className={`step-guide ${fini ? 'fini' : ''}`} aria-label={typeof titre === 'string' ? titre : 'À faire ici'} data-guide="a-faire">
      <div className="sg-tete">
        <h3>{titre}</h3>
        <span className="sg-compte num">
          {faites} sur {requises.length}
        </span>
      </div>
      <ul>
        {taches.map((t, i) => (
          <li key={i} className={t.fait ? 'fait' : ''}>
            <Coche fait={t.fait} />
            <div>
              <span className="sg-label">
                {t.label}
                {t.facultatif && <em> (facultatif)</em>}
              </span>
              {!t.fait && t.aide && <span className="sg-aide">{t.aide}</span>}
            </div>
          </li>
        ))}
      </ul>
      {fini && (
        <p className="sg-fin" role="status">
          {fin}
        </p>
      )}
    </section>
  );
}
