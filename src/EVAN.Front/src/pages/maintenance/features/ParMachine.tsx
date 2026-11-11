/**
 * Les machines une par une : ce qui est en retard chez elle et ce qui est à faire cette semaine. Un clic sur une
 * machine filtre tout l'écran sur elle : son plan complet s'affiche à la place de cette liste, et les repères du haut
 * (pannes, temps entre deux pannes) ne parlent plus que d'elle.
 */
import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import type { Machine } from '@/domain/types';
import { Details, TonGlyph } from '@/ui/explain';
import type { LigneAFaire } from '../lib/carnet';

interface Props {
  machines: Machine[];
  /** Les lignes de « À faire » : les comptes de chaque machine sont ceux de la liste. */
  lignes: LigneAFaire[];
  onPick(id: string): void;
}

interface Ligne {
  m: Machine;
  retard: number;
  bientot: number;
}

export function ParMachine({ machines, lignes: aFaire, onPick }: Props) {
  const lignes = useMemo<Ligne[]>(
    () =>
      machines.map((m) => {
        const l = aFaire.filter((x) => x.machineId === m.id);
        return {
          m,
          retard: l.filter((x) => x.urgence === 'retard').length,
          bientot: l.filter((x) => x.urgence === 'semaine').length,
        };
      }),
    [machines, aFaire],
  );
  // Les machines qui demandent quelque chose d'abord ; celles à jour restent repliées.
  const aSuivre = useMemo(() => lignes.filter((l) => l.retard || l.bientot).sort((a, b) => b.retard - a.retard || b.bientot - a.bientot), [lignes]);
  const aJour = useMemo(() => lignes.filter((l) => !l.retard && !l.bientot), [lignes]);

  return (
    <>
      <Liste lignes={aSuivre} onPick={onPick} entetes />
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

function Liste({ lignes, onPick, entetes = false }: { lignes: Ligne[]; onPick(id: string): void; entetes?: boolean }) {
  // Un petit tableau : le retard et la semaine ont chacun leur colonne, nommée une fois en tête, si bien que les
  // comptes tombent d'aplomb et que le nom de la machine garde la place. Le ton se lit au repère (carré, triangle).
  return (
    <>
      {entetes && (
        <div className="mt-machines-tete" aria-hidden>
          <span>Machine</span>
          <span>En retard</span>
          <span>Cette semaine</span>
        </div>
      )}
      <ul className="mt-machines">
        {lignes.map(({ m, retard, bientot }) => (
          <li key={m.id} data-machine={m.id}>
            <button type="button" className="mt-machine" onClick={() => onPick(m.id)}>
              <span className="mt-machine-nom" title={`${m.numero} ${m.nom}`}>
                <b>{m.numero}</b> {m.nom}
              </span>
              {retard || bientot ? (
                <>
                  <span className="mt-machine-compte num">
                    {retard > 0 && (
                      <>
                        <TonGlyph ton="crit" />
                        {retard}
                        <span className="sr-only"> en retard</span>
                      </>
                    )}
                  </span>
                  <span className="mt-machine-compte num">
                    {bientot > 0 && (
                      <>
                        <TonGlyph ton="warn" />
                        {bientot}
                        <span className="sr-only"> cette semaine</span>
                      </>
                    )}
                  </span>
                </>
              ) : (
                <span className="mt-machine-compte a-jour">À jour</span>
              )}
              <ChevronRight className="mt-machine-fleche" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
