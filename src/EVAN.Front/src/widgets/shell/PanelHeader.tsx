import type { ReactNode } from 'react';
import { InfoTip } from '@/ui/InfoTip';
import { useAvancement, type EtapeConfig, type EtatEtape } from '@/store/avancement';
import { STEPS } from './steps';

/** Classe d'un trait de progression : l'étape courante, puis l'état de chaque autre étape (store/avancement.ts). */
export function classeTrait(i: number, courante: number, etat: EtatEtape): string {
  if (i === courante) return 'en-cours';
  if (etat === 'faite') return 'fait';
  return etat === 'a-reprendre' ? 'a-reprendre' : '';
}

/**
 * En-tête du panneau d'une étape de configuration : où l'on en est, en une seule ligne (« Étape 2 sur 5 » et cinq
 * traits qui se remplissent), puis ce que l'on fait ici en clair. À quoi ça sert passe dans le « ? » du titre. Sans
 * titre ni texte donnés, ceux du parcours (steps.ts).
 *
 * La position est déjà dans la barre du haut et le rail : ici, elle reste discrète (gris, sans couleur) pour que le
 * titre mène. Un trait se remplit quand le travail de son étape est fait, pas parce qu'on l'a dépassée ; une étape
 * commencée ou laissée inachevée reste « à reprendre », en ambre, comme dans le rail.
 */
export function PanelHeader({ n, title, text, right }: { n: number; title?: string; text?: ReactNode; right?: ReactNode }) {
  const etape = STEPS.find((s) => s.n === n);
  const avancement = useAvancement();
  return (
    <div className="panel-head">
      <div className="ph-ligne">
        <span className="ph-etape num">Étape {n} sur 5</span>
        <span className="ph-progres" aria-hidden>
          {([1, 2, 3, 4, 5] as EtapeConfig[]).map((i) => (
            <i key={i} className={classeTrait(i, n, avancement[i])} />
          ))}
        </span>
        {right && <span className="ph-actions">{right}</span>}
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
