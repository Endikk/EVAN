/**
 * Une ligne de la liste « À faire » : quoi faire, où (machine et organe), quand, et une barre qui montre l'usure
 * consommée depuis le dernier passage. Le compteur chiffré, le rythme et l'historique sont dans le volet qu'ouvre un
 * clic sur la ligne ; le bouton « Consigner » ouvre directement le bon de travail prérempli.
 */
import { ClipboardCheck } from 'lucide-react';
import type { Echeance } from '@/analytics/maintenance';
import type { Machine } from '@/domain/types';
import { useUi } from '@/store/ui';
import { TonGlyph } from '@/ui/explain';
import { quand, texteCompteur, tonEcheance, type Urgence } from '../lib/carnet';

/** Bon de travail prérempli depuis une tâche du plan : la consigner remet son compteur à zéro. */
export function consignerTache(e: Echeance) {
  useUi.getState().setSaisie({
    machineId: e.machineId,
    organeId: e.organeId,
    type: 'preventive',
    tacheId: e.nature === 'systematique' ? e.tacheId : undefined,
    titre: e.tache,
    duree: e.duree,
  });
}

/**
 * Barre d'une tâche. Le trait marque l'échéance prévue ; quand elle est dépassée, l'échelle s'allonge et la part en
 * trop se dessine après le trait, dans la couleur du retard.
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
  e: Echeance;
  urgence: Urgence | null;
  machine?: Machine;
  now: number;
  /** Liste de toutes les machines : la ligne nomme la machine. */
  avecMachine: boolean;
  onOuvrir(e: Echeance, bouton: HTMLButtonElement): void;
}

export function TacheLigne({ e, urgence, machine, now, avecMachine, onOuvrir }: Props) {
  const ton = urgence ? tonEcheance(urgence) : 'ok';
  return (
    <li className={`mt-tache u-${urgence ?? 'ok'}`}>
      <button type="button" className="mt-tache-ouvrir" onClick={(ev) => onOuvrir(e, ev.currentTarget)} aria-haspopup="dialog">
        {avecMachine && machine && (
          <span className="mt-tache-machine" title={machine.nom}>
            {machine.numero}
          </span>
        )}
        <span className="mt-tache-corps">
          <span className="mt-tache-tete">
            <b>{e.tache}</b>
            <span className={`mt-quand ton-${ton}`}>
              <TonGlyph ton={ton} />
              {urgence ? quand(e, now) : `à jour, ${quand(e, now)}`}
            </span>
          </span>
          {e.organeNom && <span className="mt-tache-ou">{e.organeNom}</span>}
          <BarreTache e={e} urgence={urgence} />
          {/* Le chiffre de la barre, pour les lecteurs d'écran ; à l'écran, il est dans le volet. */}
          <span className="sr-only">{texteCompteur(e)}.</span>
        </span>
      </button>
      <button
        type="button"
        className="btn sm mt-tache-consigner"
        onClick={() => consignerTache(e)}
        aria-label={`Consigner : ${e.tache}${machine ? ` sur ${machine.numero}` : ''}`}
        title="Noter que cet entretien est fait"
      >
        <ClipboardCheck />
        <span>Consigner</span>
      </button>
    </li>
  );
}
