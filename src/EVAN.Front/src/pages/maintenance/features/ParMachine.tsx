/**
 * Les machines une par une : ce qui est en retard chez elle et ce qui est à faire cette semaine. Un clic sur une
 * machine filtre tout l'écran sur elle : son plan complet s'affiche à la place de cette liste, et les repères du haut
 * (pannes, temps entre deux pannes) ne parlent plus que d'elle.
 */
import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Echeance } from '@/analytics/maintenance';
import type { Machine } from '@/domain/types';
import { Details } from '@/ui/explain';
import { urgence } from '../lib/carnet';

interface Props {
  machines: Machine[];
  ech: Echeance[];
  now: number;
  onPick(id: string): void;
}

interface Ligne {
  m: Machine;
  retard: number;
  bientot: number;
}

export function ParMachine({ machines, ech, now, onPick }: Props) {
  const lignes = useMemo<Ligne[]>(
    () =>
      machines.map((m) => {
        const e = ech.filter((x) => x.machineId === m.id);
        return {
          m,
          retard: e.filter((x) => x.statut === 'en_retard').length,
          bientot: e.filter((x) => urgence(x, now) === 'semaine').length,
        };
      }),
    [machines, ech, now],
  );
  // Les machines qui demandent quelque chose d'abord ; celles à jour restent repliées.
  const aSuivre = useMemo(() => lignes.filter((l) => l.retard || l.bientot).sort((a, b) => b.retard - a.retard || b.bientot - a.bientot), [lignes]);
  const aJour = useMemo(() => lignes.filter((l) => !l.retard && !l.bientot), [lignes]);

  return (
    <>
      <Liste lignes={aSuivre} onPick={onPick} />
      {aJour.length > 0 && (
        <Details
          className="mt-machines-a-jour"
          titre={
            <>
              Machines à jour <span className="mt-compte num">{aJour.length}</span>
            </>
          }
          ouvert={aSuivre.length === 0}
        >
          <Liste lignes={aJour} onPick={onPick} />
        </Details>
      )}
    </>
  );
}

function Liste({ lignes, onPick }: { lignes: Ligne[]; onPick(id: string): void }) {
  return (
    <ul className="mt-machines">
      {lignes.map(({ m, retard, bientot }) => (
        <li key={m.id}>
          <button type="button" className="mt-machine" onClick={() => onPick(m.id)}>
            <span className="mt-machine-nom">
              <b>{m.numero}</b> {m.nom}
            </span>
            <span className="mt-machine-etat">
              {retard > 0 && <span className="chip crit">{retard} en retard</span>}
              {bientot > 0 && <span className="chip warn">{bientot} cette semaine</span>}
              {!retard && !bientot && <span className="chip">À jour</span>}
            </span>
            <ChevronRight className="mt-machine-fleche" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
