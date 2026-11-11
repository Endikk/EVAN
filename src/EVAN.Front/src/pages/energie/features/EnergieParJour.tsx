/**
 * Énergie par jour, de minuit à minuit, empilée par état ; le tableau reste accessible sous le graphique. Toujours les
 * 7 derniers jours, quelle que soit la période choisie en haut : le but est de comparer les jours entre eux, et le dit
 * dans son titre. Le jour en cours, pas fini, est plus pâle et marqué « en cours » : il ne passe pas pour un jour faible.
 */
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
  /** Début du jour pas encore fini (aujourd'hui). */
  enCours?: number;
  style?: CSSProperties;
}

export function EnergieParJour({ jours, enCours, style }: Props) {
  return (
    <section className="card span-12 en-par-jour entree" data-guide="par-jour" style={style} aria-labelledby="en-par-jour-titre">
      <TitreCarte
        titre="Énergie par jour, sur 7 jours"
        id="en-par-jour-titre"
        aide="Une colonne par jour, de minuit à minuit, découpée comme « Où part l’énergie ». Toujours les 7 derniers jours, quelle que soit la période choisie en haut, pour comparer les jours entre eux. Le total du jour est écrit au-dessus ; la dernière colonne, plus pâle, est le jour en cours."
        lecon={phraseParJour(jours, enCours)}
      />
      <StackedDayColumns
        data={jours.map((d) => ({ t: d.jour, values: ETATS.map((e) => d.kwh[e]) }))}
        series={ETATS.map((e) => ({ label: LIBELLE[e], color: COULEUR[e] }))}
        fmt={(v) => `${fmtNombre(v)} kWh`}
        fmtTotal={(v) => fmtNombre(v)}
        fmtDay={fmtJourCourt}
        unite="kWh"
        height={260}
        enCours={enCours}
        nom="Énergie par jour, en kWh"
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
                <td>{d.jour === enCours ? `${fmtDay(d.jour)} (en cours)` : fmtDay(d.jour)}</td>
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
