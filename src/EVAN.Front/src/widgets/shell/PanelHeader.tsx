import type { ReactNode } from 'react';
import { InfoTip } from '@/ui/InfoTip';
import { STEPS } from './steps';

/**
 * En-tête du panneau d'une étape de configuration : où l'on en est (cinq traits qui se remplissent) et ce que l'on fait
 * ici en clair. À quoi ça sert passe dans le « ? » du titre. Sans titre ni texte donnés, ceux du parcours (steps.ts).
 */
export function PanelHeader({ n, title, text, right }: { n: number; title?: string; text?: ReactNode; right?: ReactNode }) {
  const etape = STEPS.find((s) => s.n === n);
  return (
    <div className="panel-head">
      <div className="ph-progres" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={i < n ? 'fait' : i === n ? 'en-cours' : ''} />
        ))}
      </div>
      <div className="row between">
        <div className="kicker">Étape {n} sur 5</div>
        {right}
      </div>
      {/* La clé relance l'entrée du titre à chaque étape : on voit que l'écran a changé. */}
      <h2 key={n} className="ph-titre">
        {title ?? etape?.action}
        {(text ?? etape?.pourquoi) && (
          <InfoTip label="À quoi sert cette étape">
            <p>{text ?? etape?.pourquoi}</p>
          </InfoTip>
        )}
      </h2>
    </div>
  );
}
