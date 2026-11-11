/**
 * Deux formes compactes pour dire peu et bien :
 * - ChiffresSecondaires : les chiffres de second rang, en une rangée toujours visible (nom, valeur), au lieu
 *   d'une liste repliée qu'on n'ouvre pas ; le nom souligné en pointillé ouvre son explication ;
 * - TitreCarte : le titre d'un bloc, son « ? » pour la méthode, et une seule ligne qui en tire la leçon.
 */
import type { ReactNode } from 'react';
import { InfoTip } from '@/ui/InfoTip';
import { DefinitionTerme } from './Term';
import { TonGlyph, type Ton } from './PageIntro';
import { GLOSSAIRE, type TermeCle } from './glossaire';

export interface ChiffreSecondaire {
  label: string;
  valeur: ReactNode;
  unite?: string;
  /** Ce que veut dire le chiffre, dans le « ? ». */
  aide?: ReactNode;
  terme?: TermeCle;
  /** Seulement quand le chiffre sort de la normale : la couleur signale, elle ne décore pas. */
  ton?: Ton;
}

function Aide({ label, aide, terme }: { label: string; aide?: ReactNode; terme?: TermeCle }) {
  if (!aide && !terme) return null;
  return (
    <InfoTip label={`Comprendre : ${label}`}>
      {terme && <DefinitionTerme t={GLOSSAIRE[terme]} />}
      {aide && <p>{aide}</p>}
    </InfoTip>
  );
}

export function ChiffresSecondaires({ items, label = 'Autres chiffres', className = '' }: { items: ChiffreSecondaire[]; label?: string; className?: string }) {
  return (
    <dl className={`chiffres-sec ${className}`} aria-label={label}>
      {items.map((c) => (
        <div key={c.label} className={`cs-item ${c.ton && c.ton !== 'neutre' && c.ton !== 'ok' ? `ton-${c.ton}` : ''}`}>
          <dt>
            {c.aide || c.terme ? (
              <InfoTip texte={c.label} label={`Comprendre : ${c.label}`}>
                {c.terme && <DefinitionTerme t={GLOSSAIRE[c.terme]} />}
                {c.aide && <p>{c.aide}</p>}
              </InfoTip>
            ) : (
              c.label
            )}
          </dt>
          <dd className="num">
            {c.ton === 'warn' || c.ton === 'crit' ? <TonGlyph ton={c.ton} /> : null}
            {c.valeur}
            {c.unite && <small>{c.unite}</small>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface TitreCarteProps {
  titre: ReactNode;
  /** Méthode, lecture du graphique, gestes possibles : dans le « ? ». */
  aide?: ReactNode;
  terme?: TermeCle;
  /** Une seule ligne : le fait à retenir. */
  lecon?: ReactNode;
  /** Commandes du bloc (période, filtre), à droite du titre. */
  actions?: ReactNode;
  /** Niveau de titre (h2 pour une section, h3 pour une carte). */
  niveau?: 2 | 3;
  id?: string;
}

export function TitreCarte({ titre, aide, terme, lecon, actions, niveau = 3, id }: TitreCarteProps) {
  const H = niveau === 2 ? 'h2' : 'h3';
  return (
    <div className="titre-carte">
      <div className="tc-ligne">
        <H className="tc-titre" id={id}>
          {titre}
          <Aide label={typeof titre === 'string' ? titre : 'ce bloc'} aide={aide} terme={terme} />
        </H>
        {actions && <div className="tc-actions">{actions}</div>}
      </div>
      {lecon && <p className="tc-lecon">{lecon}</p>}
    </div>
  );
}
