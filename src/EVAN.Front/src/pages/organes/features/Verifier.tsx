/**
 * La coche de fin de liste : « les organes de R01 correspondent à la machine ». Elle compte dans « À faire ici » et,
 * une fois cochée, propose la machine suivante qui reste à vérifier.
 */
import { ArrowRight } from 'lucide-react';
import { useUi } from '@/store/ui';
import type { Machine } from '@/domain/types';
import { InfoTip } from '@/ui/InfoTip';

export function choisirMachine(id: string) {
  useUi.getState().selectMachine(id);
  useUi.getState().setFocus({ kind: 'machine', machineId: id });
}

/** Prochaine machine à vérifier après celle-ci, en reprenant au début de la liste. */
function suivanteAVerifier(machines: Machine[], courante: string, verifiees: Set<string>): Machine | undefined {
  const i = machines.findIndex((m) => m.id === courante);
  const ordre = [...machines.slice(i + 1), ...machines.slice(0, Math.max(0, i))];
  return ordre.find((m) => !verifiees.has(m.id));
}

export function Verifier({
  machine,
  machines,
  verifiees,
  basculer,
}: {
  machine: Machine;
  machines: Machine[];
  verifiees: Set<string>;
  basculer: () => void;
}) {
  const fait = verifiees.has(machine.id);
  const suivante = fait ? suivanteAVerifier(machines, machine.id, verifiees) : undefined;
  return (
    <section className={`og-verifier ${fait ? 'fait' : ''}`} data-guide="organes-verifier" aria-label="Vérification des organes">
      <div className="og-verifier-ligne">
        <label className="og-verifier-coche">
          <input type="checkbox" className="sr-only" checked={fait} onChange={basculer} />
          <svg className="og-coche" viewBox="0 0 22 22" width="22" height="22" aria-hidden>
            <rect className="og-coche-cadre" x="1.5" y="1.5" width="19" height="19" rx="6" />
            <path className="og-coche-trait" d="M6.5 11.4 9.6 14.4 15.6 8" />
          </svg>
          <b>
            Les organes de <span className="mono">{machine.numero}</span> correspondent à la machine
          </b>
        </label>
        {/* Hors du label : un bouton n'a rien à faire dans l'étiquette d'une case. */}
        <InfoTip label="Comment vérifier">
          <p>{fait ? 'Vérifiée. Décochez si quelque chose change sur la machine.' : 'Relisez la liste ci-dessus, dépliez un organe au besoin, puis cochez.'}</p>
        </InfoTip>
      </div>
      {fait &&
        (suivante ? (
          <button type="button" className="btn sm og-suivante" onClick={() => choisirMachine(suivante.id)}>
            Machine suivante à vérifier : <span className="mono">{suivante.numero}</span> <ArrowRight aria-hidden />
          </button>
        ) : (
          <p className="og-toutes" role="status">
            Toutes les machines sont vérifiées.
          </p>
        ))}
    </section>
  );
}
