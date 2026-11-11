/**
 * Une ligne de la liste « À faire » : quoi faire, où (machine et organe), quand et combien de temps la machine
 * s'arrête, et une barre qui montre l'usure consommée depuis le dernier passage. Le compteur chiffré, le rythme et
 * l'historique sont dans le volet qu'ouvre un clic sur la ligne ; le bouton « Consigner » ouvre le bon de travail
 * prérempli, ou, pour une intervention planifiée, la consigne telle que prévue en un geste.
 */
import type { MouseEvent } from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { Echeance } from '@/analytics/maintenance';
import type { Machine } from '@/domain/types';
import { TonGlyph } from '@/ui/explain';
import { memoriserRetour } from '@/widgets/intervention/retourFocus';
import { fmtArret, minuscule, quandLigne, texteCompteur, tonEcheance, type LigneAFaire, type Urgence } from '../lib/carnet';
import { consignerLigne, consignerPrevueFaite } from './actions';

/**
 * Barre d'une tâche. Le trait marque l'échéance prévue ; quand elle est dépassée, l'échelle s'allonge et la part en
 * trop se dessine après le trait, hachurée. La barre reste grise : le ton de l'échéance est déjà dit par la ligne.
 */
export function BarreTache({ e, urgence, grande = false }: { e: Echeance; urgence: Urgence | null; grande?: boolean }) {
  const p = Math.max(0, e.progression);
  const echelle = Math.max(1, p);
  const prevu = 1 / echelle;
  const trop = p > 1 ? (p - 1) / echelle : 0;
  return (
    <span className={`mt-barre u-${urgence ?? 'ok'} ${grande ? 'grande' : ''}`} aria-hidden>
      <i className="mt-barre-fait" style={{ transform: `scaleX(${Math.min(p, 1) / echelle})` }} />
      {trop > 0 && <i className="mt-barre-trop" style={{ left: `${prevu * 100}%`, width: `${trop * 100}%` }} />}
      <u className="mt-barre-prevu" style={{ left: `${prevu * 100}%` }} />
    </span>
  );
}

interface Props {
  l: LigneAFaire;
  machine?: Machine;
  now: number;
  /** Liste de toutes les machines : la ligne nomme la machine. */
  avecMachine: boolean;
  onOuvrir(l: LigneAFaire, bouton: HTMLButtonElement): void;
}

export function TacheLigne({ l, machine, now, avecMachine, onOuvrir }: Props) {
  const u = l.urgence;
  const ton = u ? tonEcheance(u) : 'ok';
  const numero = avecMachine ? machine?.numero : undefined;
  const ou = [l.organeNom, l.derive ? `${minuscule(l.derive.libelle)} en dérive` : null].filter(Boolean).join(' · ');
  const sur = machine ? ` sur ${machine.numero}` : '';

  const consigner = (ev: MouseEvent<HTMLButtonElement>) => {
    if (!l.prevue) {
      consignerLigne(l);
      return;
    }
    // Consignée en un geste, la ligne quitte la liste : le focus passe à la ligne qui prend sa place.
    const rendre = memoriserRetour(ev.currentTarget);
    consignerPrevueFaite(l.prevue, machine);
    requestAnimationFrame(rendre);
  };

  // Quatre colonnes alignées d'une ligne à l'autre : le numéro, la tâche et son organe, l'échéance et l'arrêt, puis
  // la barre sous la tâche. Le retard se lit au repère (forme et couleur) et aux mots, jamais à une bande de couleur.
  return (
    <li className={`mt-tache u-${u ?? 'ok'} ${l.prevue ? 'prevue' : ''}`} data-retour={l.id}>
      <button type="button" className={`mt-tache-ouvrir ${numero ? '' : 'sans-numero'}`} onClick={(ev) => onOuvrir(l, ev.currentTarget)} aria-haspopup="dialog">
        {numero && (
          <span className="mt-tache-machine" title={machine?.nom}>
            {numero}
          </span>
        )}
        <span className="mt-tache-quoi">
          <b>{l.tache}</b>
          {ou && <span className="mt-tache-ou">{ou}</span>}
        </span>
        <span className={`mt-quand ton-${ton}`}>
          <span className="mt-quand-date">
            <TonGlyph ton={ton} />
            {quandLigne(l, now)}
          </span>
          <span className="mt-quand-arret">{fmtArret(l.duree)} d’arrêt</span>
        </span>
        {l.e && <BarreTache e={l.e} urgence={u} />}
        {/* Le chiffre de la barre, pour les lecteurs d'écran ; à l'écran, il est dans le volet. */}
        {l.e && <span className="sr-only">{texteCompteur(l.e)}.</span>}
      </button>
      <button
        type="button"
        className="btn sm ghost mt-tache-consigner"
        onClick={consigner}
        aria-label={l.prevue ? `Consigner comme faite : ${l.tache}${sur}` : `Consigner : ${l.tache}${sur}`}
        title={l.prevue ? 'Noter que l’intervention prévue est faite' : 'Noter que cet entretien est fait'}
      >
        <ClipboardCheck />
        <span>Consigner</span>
      </button>
    </li>
  );
}
