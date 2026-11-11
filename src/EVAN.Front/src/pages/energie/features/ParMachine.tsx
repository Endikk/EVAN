/**
 * Par machine : ce que chaque machine a dépensé sans produire (réglages, veille, pannes sous tension), en kWh et en
 * euros, de la plus dépensière à la moins dépensière. Le classement suit cette perte et non la consommation totale, qui
 * dit surtout la taille de la machine : une grosse presse qui produit beaucoup n'est pas un problème.
 *
 * Au survol : la consommation totale, l'électricité par étiquette comparée aux autres machines du même type (jamais à
 * elle-même), les émissions et le coût. Un clic choisit la machine pour tout l'écran, comme dans l'historique. Le
 * tableau reprend les mêmes chiffres dans le même ordre, avec une unité par colonne et le total de l'usine.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import type { BilanUsine, EtatEnergie } from '@/analytics/energy';
import { MACHINE_TYPES } from '@/domain/catalog';
import { TitreCarte } from '@/ui/explain';
import { fmtNombre } from '@/ui/format';
import { HBarChart } from '@/widgets/charts/charts';
import { euros, kwh, pourcent } from '../lib/format';
import { LIBELLE, horsProductionKwh, leconParMachine } from '../lib/lecture';
import { COULEUR } from './couleurs';

/** Les trois façons de dépenser sans produire, dans l'ordre de « Où part l'énergie ». */
const PERTES: Exclude<EtatEnergie, 'marche'>[] = ['calage', 'arret', 'panne'];
const intensite = (v: number) => fmtNombre(v, v < 10 ? 2 : 0);

interface Props {
  bilan: BilanUsine;
  prix: number;
  selectedId?: string;
  onChoisir(id: string): void;
  style?: CSSProperties;
}

export function ParMachine({ bilan, prix, selectedId, onChoisir, style }: Props) {
  const [survolId, setSurvolId] = useState<string>();
  const triees = useMemo(() => [...bilan.parMachine].sort((a, b) => horsProductionKwh(b.bilan.kwh) - horsProductionKwh(a.bilan.kwh)), [bilan]);

  /** Électricité par unité des autres machines du même type : une machine ne se compare jamais à elle-même. */
  const autresDuType = useMemo(() => {
    return (id: string, type: string, unite: string) => {
      const autres = bilan.parMachine.filter((x) => x.machine.id !== id && x.machine.type === type && x.bilan.unite === unite && x.bilan.production > 0);
      const prod = autres.reduce((s, x) => s + x.bilan.production, 0);
      return prod ? (autres.reduce((s, x) => s + x.bilan.total, 0) / prod) * 1000 : undefined;
    };
  }, [bilan]);

  const data = useMemo(
    () =>
      triees.map(({ machine, bilan: b }) => {
        const ref = autresDuType(machine.id, machine.type, b.unite);
        const type = (MACHINE_TYPES[machine.type]?.libelle ?? 'machines').toLowerCase();
        return {
          id: machine.id,
          label: machine.numero,
          sub: machine.nom,
          values: PERTES.map((e) => b.kwh[e]),
          tip: (
            <div className="faint en-tip">
              Consommation totale {kwh(b.total)}, dont {pourcent(b.total ? b.kwh.marche / b.total : 0)} pour produire.
              {b.intensite !== undefined && (
                <>
                  <br />
                  {intensite(b.intensite)} kWh pour 1 000 {b.unite}
                  {ref !== undefined && ` (autres ${type} : ${intensite(ref)})`}
                </>
              )}
            </div>
          ),
        };
      }),
    [triees, autresDuType],
  );

  const total = bilan.total;
  const totalPerte = horsProductionKwh(total.kwh);

  return (
    <section
      className="card span-7 en-par-machine entree"
      data-guide="par-machine"
      data-tour="energie-machines"
      style={style}
      aria-labelledby="en-par-machine-titre"
    >
      <TitreCarte
        titre="Par machine"
        id="en-par-machine-titre"
        aide="Ce que chaque machine a dépensé sans produire, en kWh et en euros, de la plus dépensière à la moins dépensière. Survolez une machine pour sa consommation totale et son électricité par étiquette face aux autres machines du même type ; un clic la choisit pour tout l’écran."
        lecon={leconParMachine(bilan, prix)}
      />
      {data.length > 0 ? (
        <HBarChart
          data={data}
          series={PERTES.map((e) => ({ label: LIBELLE[e], color: COULEUR[e] }))}
          fmt={(v) => `${kwh(v)} · ${euros(v * prix)}`}
          onClick={onChoisir}
          onHover={setSurvolId}
          highlightId={survolId}
          selectedId={selectedId}
          labelWidth={64}
          subsInTip
          nom="Énergie dépensée sans produire, par machine"
          nommerClic={(numero, choisie) => (choisie ? 'revoir toutes les machines' : `ne voir que ${numero}`)}
        />
      ) : (
        <p className="muted">Aucune machine n’a encore d’historique.</p>
      )}
      <details className="table-view">
        <summary>Voir le tableau</summary>
        <div className="en-table-defile">
          <table className="table">
            <thead>
              <tr>
                <th>Machine</th>
                <th className="r">Sans produire (kWh)</th>
                <th className="r">Sans produire (€)</th>
                <th className="r">Consommation (kWh)</th>
                <th className="r">Production</th>
                <th className="r">kWh pour 1 000</th>
                <th className="r">CO₂e (kg)</th>
                <th className="r">Coût (€)</th>
              </tr>
            </thead>
            <tbody>
              {triees.map(({ machine, bilan: b }) => {
                const perte = horsProductionKwh(b.kwh);
                return (
                  <tr key={machine.id} aria-current={machine.id === selectedId ? 'true' : undefined}>
                    <td>
                      <b>{machine.numero}</b> <span className="muted">{machine.nom}</span>
                    </td>
                    <td className="r num">{fmtNombre(perte)}</td>
                    <td className="r num">{fmtNombre(perte * prix)}</td>
                    <td className="r num">{fmtNombre(b.total)}</td>
                    <td className="r num">
                      {fmtNombre(b.production)} {b.unite}
                    </td>
                    <td className="r num">{b.intensite !== undefined ? intensite(b.intensite) : 'sans production'}</td>
                    <td className="r num">{fmtNombre(b.co2)}</td>
                    <td className="r num">{fmtNombre(b.cout)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Toute l’usine</th>
                <td className="r num">{fmtNombre(totalPerte)}</td>
                <td className="r num">{fmtNombre(totalPerte * prix)}</td>
                <td className="r num">{fmtNombre(total.total)}</td>
                <td className="r num">
                  {fmtNombre(total.production)} {total.unite}
                </td>
                <td className="r num">{total.intensite !== undefined ? intensite(total.intensite) : 'sans production'}</td>
                <td className="r num">{fmtNombre(total.co2)}</td>
                <td className="r num">{fmtNombre(total.cout)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    </section>
  );
}
