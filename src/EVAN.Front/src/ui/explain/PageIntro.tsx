/**
 * Tête d'un écran : la réponse en une phrase à la question que l'on se pose en l'ouvrant
 * (« tout va bien ? », « qu'est-ce qui s'arrête le plus ? »). Le nom de l'écran est le titre de la barre du haut
 * (TopBar, h1) : la tête ne le répète pas. Les chiffres viennent après, et seulement ceux qui servent cette phrase.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SIMULE_DETAIL } from '@/ui/SimulatedChip';
import { GuideButton, type GuideEcran } from './Guide';

/** Ton d'un message : il choisit la couleur et la forme du repère, jamais la couleur seule. */
export type Ton = 'ok' | 'warn' | 'crit' | 'neutre';

/**
 * Repère de ton, avec les formes des états machine (ui/status) pour qu'un même écran n'ait qu'un code :
 * rond plein (ok, comme « en marche »), triangle (attention), carré (problème, comme « en panne »),
 * trait court (neutre). Le neutre n'est pas un rond creux : celui-là veut déjà dire « à l'arrêt ».
 */
export function TonGlyph({ ton }: { ton: Ton }) {
  return (
    <span className={`ton-glyph ton-${ton}`} aria-hidden>
      <svg viewBox="0 0 16 16" width="16" height="16">
        {ton === 'ok' && <circle cx="8" cy="8" r="5.5" />}
        {ton === 'warn' && <path d="M8 2 14.5 13.5H1.5Z" />}
        {ton === 'crit' && <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />}
        {ton === 'neutre' && <rect x="3" y="7" width="10" height="2" rx="1" />}
      </svg>
    </span>
  );
}

const TON_LU: Record<Ton, string> = { ok: 'Tout va bien.', warn: 'À surveiller.', crit: 'Problème en cours.', neutre: '' };

interface Props {
  /** Nom de l'écran : gardé dans les appels, la barre du haut l'affiche en titre. */
  titre: string;
  /** Gardée pour la compatibilité des appels : la tête n'affiche plus d'icône. */
  icone?: LucideIcon;
  /** La réponse en une phrase, en clair. */
  verdict: ReactNode;
  ton?: Ton;
  /** Une phrase de plus, au besoin : ce qui explique le verdict ou ce qu'il faut faire. */
  suite?: ReactNode;
  guide?: GuideEcran;
  actions?: ReactNode;
  /** Chiffres calculés sur l'historique de démonstration. */
  simule?: boolean;
}

/** Un titre ne finit pas par un point : la phrase du verdict s'affiche comme un titre. */
const sansPointFinal = (n: ReactNode): ReactNode => (typeof n === 'string' ? n.replace(/\.\s*$/, '') : n);

export function PageIntro({ verdict, ton = 'neutre', suite, guide, actions, simule }: Props) {
  return (
    <header className={`page-intro entree ton-${ton}`} data-guide="verdict">
      <div className="pi-texte">
        <p className="pi-verdict" aria-live="polite">
          <TonGlyph ton={ton} />
          <span className="sr-only">{TON_LU[ton]}</span>
          <span>{sansPointFinal(verdict)}</span>
        </p>
        {(suite || simule) && (
          <p className="pi-suite">
            {suite}
            {simule && (
              <span className="pi-simule" title={SIMULE_DETAIL}>
                Historique simulé
              </span>
            )}
          </p>
        )}
      </div>
      {(actions || guide) && (
        <div className="pi-actions">
          {actions}
          {guide && <GuideButton guide={guide} />}
        </div>
      )}
    </header>
  );
}
