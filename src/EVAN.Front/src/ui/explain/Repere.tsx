/**
 * Un repère : un chiffre qui compte, dit avec des mots. Son nom en clair et son « ? », la valeur qui monte jusqu'à
 * elle, un mot de verdict (« Bon », « En retard ») et, au besoin, une jauge qui se remplit avec sa cible.
 *
 * Tout ce qui explique (le sens du sigle, la méthode, le détail du chiffre) passe dans le « ? » : la carte ne montre
 * que ce qui se lit d'un coup d'œil. `noteVisible` garde la note sous le chiffre quand elle sert à agir.
 */
import type { ReactNode } from 'react';
import { AnimatedNumber } from '@/ui/anim';
import { InfoTip } from '@/ui/InfoTip';
import { DefinitionTerme } from './Term';
import { TonGlyph, type Ton } from './PageIntro';
import { GLOSSAIRE, type TermeCle } from './glossaire';

interface Props {
  /** Nom en clair : « Temps entre deux pannes », pas « MTBF ». */
  titre: ReactNode;
  /** Mot du métier correspondant, expliqué dans le « ? ». */
  terme?: TermeCle;
  /** Ce que veut dire ce chiffre ici, ou comment il est calculé, dans le « ? ». */
  aide?: ReactNode;
  valeur: number | string;
  /** Mise en forme d'une valeur numérique (la même pendant l'animation). */
  format?: (v: number) => string;
  unite?: ReactNode;
  ton?: Ton;
  /** Verdict en un ou deux mots. */
  mot?: string;
  /** Jauge de 0 à 1, et cible facultative sur la même échelle. */
  jauge?: number;
  cible?: number;
  /** Détail du chiffre : dans le « ? », sauf `noteVisible`. */
  note?: ReactNode;
  noteVisible?: boolean;
  onClick?: () => void;
  /** Ce que fait le clic, pour les lecteurs d'écran : « voir la liste », « aller à l'alarme ». */
  action?: string;
  /** Identifiant pour « Montrer » dans le guide de l'écran. */
  guide?: string;
  className?: string;
}

export function Repere({ titre, terme, aide, valeur, format, unite, ton = 'neutre', mot, jauge, cible, note, noteVisible, onClick, action = 'voir le détail', guide, className = '' }: Props) {
  const noteDansAide = note && !noteVisible ? note : undefined;
  const aAide = terme || aide || noteDansAide;
  const corps = (
    <>
      <div className="rp-titre">
        {aAide ? (
          <InfoTip texte={titre} label={`Comprendre : ${typeof titre === 'string' ? titre : 'ce chiffre'}`}>
            {terme && <DefinitionTerme t={GLOSSAIRE[terme]} />}
            {aide && <p>{aide}</p>}
            {noteDansAide && <p>{noteDansAide}</p>}
          </InfoTip>
        ) : (
          <span>{titre}</span>
        )}
      </div>
      <div className="rp-valeur">
        <b>{typeof valeur === 'number' ? <AnimatedNumber value={valeur} format={format} /> : valeur}</b>
        {unite && <small>{unite}</small>}
      </div>
      {mot && (
        <span className={`rp-mot ton-${ton}`}>
          <TonGlyph ton={ton} />
          {mot}
        </span>
      )}
      {jauge !== undefined && (
        <div className={`rp-jauge ton-${ton}`} role="presentation">
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, jauge))})` }} />
          {cible !== undefined && <u style={{ left: `${Math.max(0, Math.min(1, cible)) * 100}%` }} title="Cible" />}
        </div>
      )}
      {note && noteVisible && <p className="rp-note">{note}</p>}
    </>
  );
  const classes = `repere ton-${ton} ${onClick ? 'cliquable' : ''} ${className}`;
  // Repère cliquable : un vrai bouton étiré sur toute la carte (CSS), frère du libellé qui ouvre l'aide. Un élément
  // role="button" qui contiendrait ce libellé le rendrait muet pour les lecteurs d'écran.
  const nom = typeof titre === 'string' ? titre : 'Ce chiffre';
  return onClick ? (
    <div className={classes} data-guide={guide}>
      {corps}
      <button type="button" className="rp-etendu" onClick={onClick} aria-label={`${nom} : ${action}`} />
    </div>
  ) : (
    <div className={classes} data-guide={guide}>
      {corps}
    </div>
  );
}
