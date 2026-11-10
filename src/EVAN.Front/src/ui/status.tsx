import type { EtatMachine } from '@/domain/types';

export const ETAT_LIBELLE: Record<EtatMachine, string> = {
  marche: 'En marche',
  attention: 'À surveiller',
  panne: 'En panne',
  arret: 'À l’arrêt',
  calage: 'En réglage (calage)',
};

/** Ce que chaque état veut dire pour l'atelier, en une phrase (légende de la scène, infobulles). */
export const ETAT_SENS: Record<EtatMachine, string> = {
  marche: 'La machine produit des étiquettes, toutes ses mesures sont dans leur plage.',
  attention: 'Une mesure sort de sa plage normale. La machine tourne encore : il faut aller voir.',
  panne: 'Une alarme a arrêté la machine. EVAN montre l’organe en cause.',
  calage: 'On change les clichés, on règle le repérage ou l’outil de découpe : pendant ce temps, la machine ne produit pas.',
  arret: 'La machine est arrêtée sans alarme, ou EVAN ne reçoit plus ses données.',
};

/** La forme de l'icône de chaque état, dite en mots : la couleur n'est jamais seule à porter l'état. */
export const ETAT_FORME: Record<EtatMachine, string> = {
  marche: 'rond plein',
  attention: 'triangle',
  panne: 'carré',
  calage: 'losange',
  arret: 'rond creux',
};

/** Libellé d'une machine dont plus aucune donnée n'arrive (passerelle ou automate injoignable). */
export const LIBELLE_HORS_LIGNE = 'Liaison perdue';

/**
 * État à afficher : une machine hors ligne apparaît éteinte (voyants et animation coupés), pas dans son dernier état
 * connu, qui n'est peut-être plus vrai.
 */
export function etatAffiche(l: { etat: EtatMachine; horsLigne?: boolean } | undefined, defaut: EtatMachine = 'arret'): EtatMachine {
  if (!l) return defaut;
  return l.horsLigne ? 'arret' : l.etat;
}

/**
 * Couleurs des états pour la 3D et le canvas : miroir des jetons de nuit (--ok, --warn, --crit, --idle, --setup de
 * styles/jetons.css), lisibles sur le sol satellite dans les deux thèmes. À changer en même temps que les jetons.
 */
export const ETAT_COULEUR: Record<EtatMachine, string> = {
  marche: '#2fd07f',
  attention: '#f6b73c',
  panne: '#ff3d6e',
  arret: '#7e8aa0',
  calage: '#5c9dff',
};

/**
 * Icône d'état : la forme porte l'information autant que la couleur
 * (cercle plein = marche, triangle = attention, carré = panne, losange = calage, cercle creux = arrêt).
 */
export function StatusIcon({ etat, size = 12, animate = true }: { etat: EtatMachine; size?: number; animate?: boolean }) {
  const cls = `status-icon st st-${etat} ${animate && etat === 'panne' ? 'pulse' : ''} ${animate && etat === 'attention' ? 'blink' : ''}`;
  const s = size;
  return (
    <svg className={cls} width={s} height={s} viewBox="0 0 12 12" aria-hidden="true" style={{ transformOrigin: 'center' }}>
      {etat === 'marche' && <circle cx="6" cy="6" r="5" fill="currentColor" />}
      {etat === 'attention' && <path d="M6 0.8 11.4 10.6H0.6Z" fill="currentColor" />}
      {etat === 'panne' && <rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor" />}
      {etat === 'calage' && <path d="M6 0.5 11.5 6 6 11.5 0.5 6Z" fill="currentColor" />}
      {etat === 'arret' && <circle cx="6" cy="6" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />}
    </svg>
  );
}

export function StatusPill({ etat, label }: { etat: EtatMachine; label?: string }) {
  return (
    <span className={`status-pill st st-${etat}`}>
      <StatusIcon etat={etat} size={10} />
      {label ?? ETAT_LIBELLE[etat]}
    </span>
  );
}
