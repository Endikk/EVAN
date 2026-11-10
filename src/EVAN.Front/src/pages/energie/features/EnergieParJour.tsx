/** Énergie par jour, de minuit à minuit, empilée par état ; le tableau reste accessible sous le graphique. */
import type { CSSProperties } from 'react';
import type { EtatEnergie } from '@/analytics/energy';
import { TitreCarte } from '@/ui/explain';
import { fmtDay, fmtNombre } from '@/ui/format';
import { StackedDayColumns } from '@/widgets/charts/charts';
import { fmtJourCourt } from '../lib/format';
import { ETATS, LIBELLE, phraseParJour } from '../lib/lecture';
import { COULEUR } from './couleurs';

interface Props {
  jours: { jour: number; kwh: Record<EtatEnergie, number>; total: number }[];
  style?: CSSProperties;
}

export function EnergieParJour({ jours, style }: Props) {
  return (
    <section className="card span-7 en-par-jour entree" data-guide="par-jour" style={style} aria-labelledby="en-par-jour-titre">
      <TitreCarte
        titre="Énergie par jour"
        id="en-par-jour-titre"
        aide="Une colonne par jour, de minuit à minuit, découpée comme « Où part l’énergie ». Le total du jour est écrit au-dessus."
        lecon={phraseParJour(jours)}
      />
      <StackedDayColumns
        data={jours.map((d) => ({ t: d.jour, values: ETATS.map((e) => d.kwh[e]) }))}
        series={ETATS.map((e) => ({ label: LIBELLE[e], color: COULEUR[e] }))}
        fmt={(v) => `${fmtNombre(v)} kWh`}
        fmtTotal={(v) => fmtNombre(v)}
        fmtDay={fmtJourCourt}
        unite="kWh"
        height={260}
      />
      <details className="table-view">
        <summary>Voir le tableau</summary>
        <table className="table">
          <thead>
            <tr>
              <th>Jour</th>
              {ETATS.map((e) => (
                <th key={e} className="r">
                  {LIBELLE[e]}
                </th>
              ))}
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {jours.map((d) => (
              <tr key={d.jour}>
                <td>{fmtDay(d.jour)}</td>
                {ETATS.map((e) => (
                  <td key={e} className="r num">
                    {fmtNombre(d.kwh[e])}
                  </td>
                ))}
                <td className="r num">{fmtNombre(d.total)} kWh</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
