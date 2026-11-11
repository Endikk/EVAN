/**
 * Onglet « Machines » : les machines groupées par état (le mot est le titre du groupe, la forme est sur la ligne),
 * depuis quand hors de la marche normale, et la vitesse rapportée à la normale. Un clic ouvre ce qui se passe dans la machine (ou plonge sur la panne s'il y en a une).
 */
import { ChevronRight } from 'lucide-react';
import type { EtatMachine } from '@/domain/types';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { useLive } from '@/store/live';
import { MACHINE_TYPES } from '@/domain/catalog';
import { StatusIcon } from '@/ui/status';
import { fmtDuration, fmtValue } from '@/ui/format';
import { focusAlarm } from '@/widgets/shell/navigation';
import { estExercice } from '@/widgets/pannes/exercice';
import { ETAT_MOT, MOT_HORS_LIGNE, type EtatAtelier, type MachineEtat } from '../lib/atelier';

const GROUPES: EtatMachine[] = ['panne', 'attention', 'calage', 'marche', 'arret'];

function ouvrir(machineId: string) {
  const crit = useLive.getState().alarms.find((a) => a.machineId === machineId && a.statut !== 'resolue' && a.gravite === 'critique');
  if (crit) return focusAlarm(crit.id);
  useUi.getState().selectMachine(machineId);
  useUi.getState().setFocus({ kind: 'machine', machineId });
}

function Ligne({ e, now }: { e: MachineEtat; now: number }) {
  const l = useLive((s) => s.machines[e.machine.id]);
  // Machine en panne : cramoisi si la panne est réelle, pointillé si elle vient de « Simuler une panne ».
  const panne = useLive((s) => s.alarms.find((a) => a.machineId === e.machine.id && a.statut !== 'resolue' && a.gravite === 'critique'));
  const exercice = e.etat === 'panne' && !!panne && estExercice(panne);
  const type = MACHINE_TYPES[e.machine.type];
  const facteur = Math.min(1, Math.max(0, l?.facteur ?? 0));
  const mot = e.horsLigne ? MOT_HORS_LIGNE : ETAT_MOT[e.etat];
  // L'état est déjà le titre du groupe : la ligne ne dit que depuis quand, et seulement hors de la marche normale.
  const depuis = e.depuis && (e.horsLigne || e.etat !== 'marche') ? `depuis ${fmtDuration(now - e.depuis)}` : undefined;
  return (
    <li>
      <button className={`sv-machine ${e.etat === 'panne' && !exercice ? 'crit' : ''} ${exercice ? 'exercice' : ''}`} onClick={() => ouvrir(e.machine.id)}>
        <span className={`st st-${e.etat}`} title={mot}>
          <StatusIcon etat={e.etat} />
        </span>
        <span className="sr-only">{mot} :</span>
        <span className="sv-machine-nom">
          <b>{e.machine.numero}</b> {e.machine.nom}
          {depuis && <span className="sv-machine-etat">{depuis}</span>}
        </span>
        <span className="sv-vitesse" title={`Vitesse : ${fmtValue(l?.vitesse ?? 0)} ${type?.vitesse.unite ?? ''}, ${Math.round(facteur * 100)} % de la normale`}>
          <span className="num">
            {fmtValue(l?.vitesse ?? 0)} <span className="faint">{type?.vitesse.unite}</span>
          </span>
          <i>
            <b className={`st st-${e.etat}`} style={{ transform: `scaleX(${facteur})` }} />
          </i>
        </span>
        <ChevronRight className="sv-machine-voir" aria-hidden />
      </button>
    </li>
  );
}

export function Machines({ atelier }: { atelier: EtatAtelier }) {
  // Les durées « depuis » suivent l'horloge du flux.
  useLive((s) => s.tick);
  const now = Date.now();
  const total = useProject((s) => s.machines.length);
  if (!total) return <p className="faint">Aucune machine dans cette usine pour l’instant.</p>;

  const groupes = GROUPES.map((etat) => ({ etat, liste: atelier.bande.filter((b) => !b.horsLigne && b.etat === etat) })).filter((g) => g.liste.length);
  const horsLigne = atelier.bande.filter((b) => b.horsLigne);

  return (
    <div className="sv-machines">
      {groupes.map((g) => (
        <section key={g.etat} aria-label={ETAT_MOT[g.etat]}>
          <h3 className="sv-groupe">
            {ETAT_MOT[g.etat]} <span className="faint">({g.liste.length})</span>
          </h3>
          <ul>
            {g.liste.map((e) => (
              <Ligne key={e.machine.id} e={e} now={now} />
            ))}
          </ul>
        </section>
      ))}
      {horsLigne.length > 0 && (
        <section aria-label={MOT_HORS_LIGNE}>
          <h3 className="sv-groupe">
            {MOT_HORS_LIGNE} <span className="faint">({horsLigne.length})</span>
          </h3>
          <ul>
            {horsLigne.map((e) => (
              <Ligne key={e.machine.id} e={e} now={now} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
