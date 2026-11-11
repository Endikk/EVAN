/**
 * Ce qu'il y a à faire dans une étape de configuration, sous forme de liste qui se coche toute seule
 * à mesure que c'est fait. Quand tout est coché, la liste le dit et invite à passer à la suite.
 *
 * Comment faire une tâche s'ouvre depuis son libellé, souligné en pointillé, tant qu'elle n'est pas faite : la liste
 * ne se couvre pas de « ? ». Un compte (« 14 sur 14 ») se pose au bout de la ligne, dans la colonne du compte du titre.
 */
import type { ReactNode } from 'react';
import { InfoTip } from '@/ui/InfoTip';

export interface Tache {
  label: ReactNode;
  fait: boolean;
  /** Une ligne toujours en vue sous le libellé tant que ce n'est pas fait (un numéro en double, une écriture). */
  aide?: ReactNode;
  /** Comment faire : la bulle qui s'ouvre depuis le libellé, tant que la tâche n'est pas faite. */
  comment?: ReactNode;
  /** Où l'on en est, au bout de la ligne (« 14 sur 14 », « 14 posées »). */
  compte?: ReactNode;
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

/** Le libellé seul, ou le libellé qui ouvre « comment faire » tant que la tâche reste à faire. */
function Libelle({ t }: { t: Tache }) {
  if (!t.comment || t.fait) return <>{t.label}</>;
  const nom = typeof t.label === 'string' ? `Comment faire : ${t.label}` : 'Comment faire';
  return (
    <InfoTip texte={t.label} label={nom}>
      <p>{t.comment}</p>
    </InfoTip>
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
        {taches.map((t, i) => {
          const compte = t.compte !== undefined && t.compte !== false && t.compte !== null;
          return (
            <li key={i} className={t.fait ? 'fait' : ''}>
              <Coche fait={t.fait} />
              <div className="sg-texte">
                <span className="sg-label">
                  <Libelle t={t} />
                  {t.facultatif && compte && <em> (facultatif)</em>}
                </span>
                {!t.fait && t.aide && <span className="sg-aide">{t.aide}</span>}
              </div>
              {/* Au bout de la ligne : le compte, ou à défaut « facultatif » (le libellé qui ouvre l'aide ne se coupe pas). */}
              {compte ? <span className="sg-ligne-compte num">{t.compte}</span> : t.facultatif && <span className="sg-ligne-compte">facultatif</span>}
            </li>
          );
        })}
      </ul>
      {fini && (
        <p className="sg-fin" role="status">
          {fin}
        </p>
      )}
    </section>
  );
}
