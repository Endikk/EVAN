/**
 * L'efficacité (TRS) machine par machine, puis jour par jour avec ce qui la fait baisser : les arrêts, la lenteur
 * ou les étiquettes jetées. Le repère de 85 % est une référence générale, dite comme telle dans le « ? ».
 *
 * Ses trois parts portent les mêmes noms que la rangée de chiffres du haut (Disponibilité, Vitesse, Bonnes
 * étiquettes) : deux noms pour le même chiffre feraient croire à deux chiffres.
 */
import { useMemo } from 'react';
import { fmtDay } from '@/ui/format';
import { HBarChart, TrsTrend, type BarSeries } from '@/widgets/charts/charts';
import type { JourTrs, LigneMachine, Periode } from '../lib/calculs';
import { fmtJourAxe, leconEfficaciteMachines, leconJours, pourcent } from '../lib/phrases';
import { useEtroit } from '../lib/useEtroit';
import { Carte } from './Carte';
import { nommerClic } from './nommerClic';

/** Une seule série, sans état : un palier de neutre. Ce qui ressort, c'est le trait du repère et la machine choisie. */
const SERIE_TRS: BarSeries[] = [{ label: 'Efficacité', color: 'var(--serie-neutre-1)' }];
const LIBELLES = { trs: 'Efficacité (TRS)', D: 'Disponibilité', P: 'Vitesse', Q: 'Bonnes étiquettes' };
const REPERE = { valeur: 85, label: 'Repère 85\u00a0%' };

interface MachinesProps {
  lignes: LigneMachine[];
  selectionId: string;
  onChoisir(id: string): void;
  rang: number;
}

export function EfficaciteMachines({ lignes, selectionId, onChoisir, rang }: MachinesProps) {
  const donnees = useMemo(
    () =>
      lignes
        .filter((l) => l.trs !== undefined)
        .sort((a, b) => b.trs! - a.trs!)
        .map((l) => ({
          id: l.m.id,
          label: l.m.numero,
          sub: l.m.nom,
          values: [l.trs! * 100],
          tip: (
            <div className="faint hist-tip">
              Disponibilité {pourcent(l.D!)} · vitesse {pourcent(l.P!)} · bonnes étiquettes {pourcent(l.Q!)}
            </div>
          ),
        })),
    [lignes],
  );
  return (
    <Carte
      titre="Efficacité, machine par machine"
      terme="trs"
      aide={`Le trait vertical marque 85\u00a0%, un repère souvent cité pour les usines les plus performantes. Survolez une barre pour voir ce qui la fait baisser ; un clic choisit la machine.`}
      lecon={leconEfficaciteMachines(lignes, selectionId)}
      span={5}
      rang={rang}
      guide="trs-machines"
      tour="trs"
    >
      {donnees.length ? (
        <HBarChart
          data={donnees}
          series={SERIE_TRS}
          max={100}
          fmt={(v) => `${Math.round(v)} %`}
          onClick={onChoisir}
          selectedId={selectionId || undefined}
          labelWidth={64}
          subsInTip
          repere={{ valeur: REPERE.valeur, label: REPERE.label }}
          nom="Efficacité, machine par machine"
          nommerClic={nommerClic}
        />
      ) : (
        <p className="muted">Aucune machine n’a tourné sur la période.</p>
      )}
    </Carte>
  );
}

interface JoursProps {
  jours: JourTrs[];
  periode: Periode;
  /** Ce que la courbe compte (une machine, ou tout l'atelier pondéré) : dans le « ? ». */
  perimetre: string;
  rang: number;
}

export function EfficaciteJours({ jours, periode, perimetre, rang }: JoursProps) {
  const etroit = useEtroit();
  // L'efficacité n'est relevée qu'une fois par jour : sur 24 heures, les jours touchés comptent en entier, et le « ? »
  // le dit plutôt que de laisser croire à une efficacité « depuis midi ».
  const jourEntier = periode === '24h' ? ' Sur 24 heures, chaque jour touché compte en entier : l’efficacité se calcule par journée.' : '';
  return (
    <Carte
      titre="Efficacité, jour par jour"
      aide={`${perimetre} Des trois autres courbes, la plus basse montre la perte qui coûte le plus.${jourEntier}`}
      lecon={leconJours(jours)}
      span={7}
      rang={rang}
      guide="trs-jours"
    >
      {jours.length > 1 && (
        <TrsTrend data={jours} fmtDay={fmtJourAxe} libelles={LIBELLES} reference={REPERE} height={etroit ? 260 : 330} nom="Efficacité jour par jour, en pourcentage" />
      )}
      {jours.length > 0 && (
        <details className="table-view">
          <summary>Voir le tableau</summary>
          <table className="table">
            <thead>
              <tr>
                <th>Jour</th>
                <th className="r">Efficacité</th>
                <th className="r">Disponibilité</th>
                <th className="r">Vitesse</th>
                <th className="r">Bonnes étiquettes</th>
              </tr>
            </thead>
            <tbody>
              {jours.map((d) => (
                <tr key={d.t}>
                  <td>{fmtDay(d.t)}</td>
                  <td className="r num">{d.trs} %</td>
                  <td className="r num">{d.D} %</td>
                  <td className="r num">{d.P} %</td>
                  <td className="r num">{d.Q} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </Carte>
  );
}
