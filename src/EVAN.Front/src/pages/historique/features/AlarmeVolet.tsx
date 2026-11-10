/**
 * Volet d'une alarme du journal : ce qui s'est passé, sur quel organe, combien de temps, qui s'en est occupé et
 * quoi vérifier. Il glisse depuis la droite comme le guide de l'écran (mêmes styles), se ferme par Échap ou en
 * cliquant à côté, garde le focus à l'intérieur et le rend au bouton qui l'a ouvert.
 */
import { useEffect, useId, useRef, type KeyboardEvent as KE } from 'react';
import { createPortal } from 'react-dom';
import { Box, ChartLine, TriangleAlert, X } from 'lucide-react';
import type { Alarme, Machine } from '@/domain/types';
import { Term } from '@/ui/explain';
import { fmtHM, fmtValue } from '@/ui/format';
import { StatusIcon } from '@/ui/status';
import { dureeEnMots } from '../lib/phrases';

interface Props {
  alarme: Alarme;
  machine?: Machine;
  organe?: string;
  /** La mesure en cause a une courbe : on peut l'ouvrir. */
  courbe: boolean;
  now: number;
  onFermer(): void;
  onVoirCourbe(): void;
  onVoirMachine(): void;
}

/** Ce qu'a vu EVAN, selon la règle qui a levé l'alarme. */
function ceQuiSestPasse(a: Alarme): string[] {
  const phrases: string[] = [];
  if (a.regle === 'repetitif' && a.repetitions) {
    phrases.push(`C’est la ${a.repetitions}e fois en moins de 8 heures au même endroit : souvent le signe d’une cause qui n’a pas été réglée.`);
  }
  if (a.regle === 'derive') phrases.push('La mesure glissait lentement vers sa limite : EVAN a prévenu avant qu’elle soit atteinte.');
  if (a.regle === 'automate') phrases.push('C’est l’automate de la machine qui a signalé le défaut.');
  if (a.valeur !== undefined && a.seuil !== undefined && a.regle !== 'automate') {
    const sens = a.valeur > a.seuil ? 'au-dessus de' : 'en dessous de';
    phrases.push(`La mesure a atteint ${fmtValue(a.valeur, a.unite)}, ${sens} sa limite de ${fmtValue(a.seuil, a.unite)}.`);
  } else if (a.valeur !== undefined && a.regle !== 'automate') {
    phrases.push(`Valeur mesurée : ${fmtValue(a.valeur, a.unite)}.`);
  }
  return phrases;
}

export function dureeAlarme(a: Alarme, now: number): string {
  if (a.finLe === undefined) return `En cours depuis ${dureeEnMots(now - a.horodatage)}`;
  return a.gravite === 'critique' ? `Machine arrêtée ${dureeEnMots(a.finLe - a.horodatage)}` : `A duré ${dureeEnMots(a.finLe - a.horodatage)}`;
}

const jourLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export const STATUT_ALARME: Record<Alarme['statut'], string> = {
  resolue: 'Résolue',
  acquittee: 'Prise en charge, pas encore résolue',
  active: 'Pas encore prise en charge',
};

export function AlarmeVolet({ alarme: a, machine, organe, courbe, now, onFermer, onVoirCourbe, onVoirMachine }: Props) {
  const titreId = useId();
  const volet = useRef<HTMLElement>(null);
  const fermer = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    fermer.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      avant?.focus({ preventScroll: true });
    };
  }, [onFermer]);

  // Tab tourne dans le volet : le reste de l'écran est derrière le voile.
  const garderFocus = (e: KE) => {
    if (e.key !== 'Tab' || !volet.current) return;
    const focusables = [...volet.current.querySelectorAll<HTMLElement>('button, [href], select, input, [tabindex]:not([tabindex="-1"])')];
    if (!focusables.length) return;
    const premier = focusables[0];
    const dernier = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  const critique = a.gravite === 'critique';
  const phrases = ceQuiSestPasse(a);
  const vue = a.acquitteeLe !== undefined;

  return createPortal(
    <div className="guide-fond" onMouseDown={onFermer}>
      <aside
        ref={volet}
        className="guide-volet hist-volet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titreId}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={garderFocus}
      >
        <header className="guide-tete">
          <span className={`guide-icone hv-icone ${critique ? 'crit' : 'warn'}`} aria-hidden>
            <TriangleAlert />
          </span>
          <div className="grow">
            <p className="guide-sur">
              Alarme du {jourLong.format(a.horodatage)} à {fmtHM(a.horodatage)}
            </p>
            <h2 id={titreId}>{a.message}</h2>
          </div>
          <button ref={fermer} type="button" className="btn sm icon ghost" onClick={onFermer} aria-label="Fermer le détail de l’alarme" title="Fermer (Échap)">
            <X />
          </button>
        </header>
        <div className="guide-corps hv-corps">
          <p className={`hv-statut ${a.statut}`}>
            <StatusIcon etat={critique ? 'panne' : 'attention'} size={11} animate={a.statut === 'active'} />
            {critique ? 'Alarme critique' : 'Alarme d’attention'} · {STATUT_ALARME[a.statut]}
          </p>

          <section className="hv-bloc">
            <h3>Ce qui s’est passé</h3>
            <p>
              Sur {machine ? `${machine.numero} (${machine.nom})` : 'la machine'}, l’<Term k="organe">organe</Term> « {organe ?? 'inconnu'} » a signalé un problème.
            </p>
            {phrases.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </section>

          <section className="hv-bloc">
            <h3>Combien de temps</h3>
            <p>{dureeAlarme(a, now)}.</p>
            {vue && (
              <p>
                <Term k="acquittement">Prise en charge</Term> {a.acquitteePar ? `par ${a.acquitteePar} ` : ''}
                {dureeEnMots(a.acquitteeLe! - a.horodatage)} après l’alarme.
              </p>
            )}
          </section>

          {a.cause && (
            <section className="hv-bloc">
              <h3>Cause probable et quoi vérifier</h3>
              <p>{a.cause}</p>
            </section>
          )}

          <div className="hv-actions">
            {courbe && (
              <button type="button" className="btn sm" onClick={onVoirCourbe}>
                <ChartLine /> Voir la courbe de cette mesure
              </button>
            )}
            {a.statut !== 'resolue' && (
              <button type="button" className="btn sm" onClick={onVoirMachine}>
                <Box /> Voir l’organe sur la machine
              </button>
            )}
          </div>
          <p className="hv-code">
            Code de l’alarme : <span className="mono">{a.code}</span>
          </p>
        </div>
      </aside>
    </div>,
    document.body,
  );
}
