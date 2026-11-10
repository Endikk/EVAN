/**
 * Tête d'un écran : son nom, puis la réponse en une phrase à la question que l'on se pose en l'ouvrant
 * (« tout va bien ? », « qu'est-ce qui s'arrête le plus ? »). Les chiffres viennent après, et seulement ceux
 * qui servent cette phrase.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { SimulatedChip } from '@/ui/SimulatedChip';
import { PixelField } from '@/ui/PixelField';
import { GuideButton, type GuideEcran } from './Guide';

/** Ton d'un message : il choisit la couleur et la forme du repère, jamais la couleur seule. */
export type Ton = 'ok' | 'warn' | 'crit' | 'neutre';

/**
 * Repère de ton, avec les formes des états machine (ui/status) pour qu'un même écran n'ait qu'un code :
 * rond plein (ok, comme « en marche »), triangle (attention), carré qui pulse (problème, comme « en panne »),
 * rond creux (neutre).
 */
export function TonGlyph({ ton }: { ton: Ton }) {
  return (
    <span className={`ton-glyph ton-${ton}`} aria-hidden>
      <svg viewBox="0 0 16 16" width="16" height="16">
        {ton === 'ok' && <circle cx="8" cy="8" r="5.5" />}
        {ton === 'warn' && <path d="M8 2 14.5 13.5H1.5Z" />}
        {ton === 'crit' && <rect x="2.5" y="2.5" width="11" height="11" rx="2.5" />}
        {ton === 'neutre' && <circle cx="8" cy="8" r="4.5" fill="none" strokeWidth="2" />}
      </svg>
    </span>
  );
}

const TON_LU: Record<Ton, string> = { ok: 'Tout va bien.', warn: 'À surveiller.', crit: 'Problème en cours.', neutre: '' };

interface Props {
  titre: string;
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
  /** Nuage de pixels derrière la droite de la tête (par défaut). */
  pixels?: boolean;
}

export function PageIntro({ titre, icone: Icone, verdict, ton = 'neutre', suite, guide, actions, simule, pixels = true }: Props) {
  return (
    <header className={`page-intro entree ton-${ton}`} data-guide="verdict">
      {pixels && <PixelField placement="haut-droite" intensite={1} />}
      <div className="pi-texte">
        <div className="pi-titre">
          {Icone && <Icone aria-hidden />}
          <h1>{titre}</h1>
          {simule && <SimulatedChip />}
        </div>
        <p className="pi-verdict" aria-live="polite">
          <TonGlyph ton={ton} />
          <span className="sr-only">{TON_LU[ton]}</span>
          <span>{verdict}</span>
        </p>
        {suite && <p className="pi-suite">{suite}</p>}
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
