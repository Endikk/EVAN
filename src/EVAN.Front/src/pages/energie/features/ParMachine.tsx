/**
 * Énergie machine par machine, empilée par état. Au survol : électricité par étiquette (comparée aux machines du même
 * type), émissions et coût. Le tableau reprend les mêmes chiffres pour qui préfère lire.
 */
import { useMemo, useState } from 'react';
import type { BilanUsine } from '@/analytics/energy';
import { fmtNombre } from '@/ui/format';
import { HBarChart } from '@/widgets/charts/charts';
import { co2, euros } from '../lib/format';
import { ETATS, LIBELLE } from '../lib/lecture';
import { COULEUR } from './couleurs';

const intensite = (v: number) => fmtNombre(v, v < 10 ? 2 : 0);

export function ParMachine({ bilan, selectedId }: { bilan: BilanUsine; selectedId?: string }) {
  const [survolId, setSurvolId] = useState<string>();

  /** Électricité par étiquette de chaque type de machine, pour situer chacune face à ses semblables. */
  const parType = useMemo(() => {
    const m = new Map<string, { kwh: number; prod: number }>();
    for (const { machine, bilan: b } of bilan.parMachine) {
      if (b.unite !== 'étiquettes' || !b.production) continue;
      const cur = m.get(machine.type) ?? { kwh: 0, prod: 0 };
      m.set(machine.type, { kwh: cur.kwh + b.total, prod: cur.prod + b.production });
    }
    return m;
  }, [bilan]);

  const data = useMemo(
    () =>
      [...bilan.parMachine]
        .sort((a, b) => b.bilan.total - a.bilan.total)
        .map(({ machine, bilan: b }) => {
          const ref = parType.get(machine.type);
          return {
            id: machine.id,
            label: machine.numero,
            sub: machine.nom,
            values: ETATS.map((e) => b.kwh[e]),
            tip: (
              <div className="faint" style={{ marginTop: 4 }}>
                {b.intensite !== undefined && `${intensite(b.intensite)} kWh pour 1 000 ${b.unite}`}
                {ref && b.unite === 'étiquettes' && ` (même type : ${fmtNombre((ref.kwh / ref.prod) * 1000, 2)})`}
                <br />
                {co2(b.co2)} CO₂e · {euros(b.cout)}
              </div>
            ),
          };
        }),
    [bilan, parType],
  );

  return (
    <div className="en-par-machine">
      <HBarChart
        data={data}
        series={ETATS.map((e) => ({ label: LIBELLE[e], color: COULEUR[e] }))}
        fmt={(v) => `${fmtNombre(v)} kWh`}
        onHover={setSurvolId}
        highlightId={survolId}
        selectedId={selectedId}
        labelWidth={64}
        subsInTip
      />
      <details className="table-view">
        <summary>Voir le tableau</summary>
        <table className="table">
          <thead>
            <tr>
              <th>Machine</th>
              <th className="r">Énergie</th>
              <th className="r">Production</th>
              <th className="r">kWh pour 1 000</th>
              <th className="r">CO₂e</th>
              <th className="r">Coût</th>
            </tr>
          </thead>
          <tbody>
            {bilan.parMachine.map(({ machine, bilan: b }) => (
              <tr key={machine.id}>
                <td>
                  <b>{machine.numero}</b> <span className="muted">{machine.nom}</span>
                </td>
                <td className="r num">{fmtNombre(b.total)} kWh</td>
                <td className="r num">
                  {fmtNombre(b.production)} {b.unite}
                </td>
                <td className="r num">{b.intensite !== undefined ? intensite(b.intensite) : 'sans production'}</td>
                <td className="r num">{co2(b.co2)}</td>
                <td className="r num">{euros(b.cout)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
