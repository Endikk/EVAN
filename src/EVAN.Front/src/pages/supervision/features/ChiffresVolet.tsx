/**
 * « Plus de chiffres » : ce qui ne tient pas dans le bandeau sans l'encombrer. Une rangée compacte de chiffres
 * (production et étiquettes jetées depuis l'ouverture de la page, cadence, arrêts sur panne du jour, efficacité de la
 * semaine), chacun avec son « ? » ; la courbe de l'efficacité des dernières minutes face à sa moyenne de la semaine ;
 * la répartition des machines par état.
 */
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { ChiffresSecondaires, TitreCarte, type ChiffreSecondaire } from '@/ui/explain';
import { StatusIcon } from '@/ui/status';
import { SimulatedChip } from '@/ui/SimulatedChip';
import { fmtDuration, pct } from '@/ui/format';
import type { EtatMachine } from '@/domain/types';
import { ETAT_MOT, MOT_HORS_LIGNE, type EtatAtelier } from '../lib/atelier';
import { Volet } from './Volet';

export interface PointTendance {
  t: number;
  /** TRS en %, une décimale. */
  v: number;
}

interface Props {
  fermer: () => void;
  atelier: EtatAtelier;
  bonnes: number;
  gache: number;
  /** Étiquettes par heure sur la dernière minute. */
  cadence: number;
  arretsJour: number;
  trs: number;
  trs7j: number;
  tendance: PointTendance[];
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const hm = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const ORDRE: EtatMachine[] = ['marche', 'attention', 'calage', 'arret', 'panne'];
/** Écart (en points) sous lequel on parle d'efficacité « au niveau » de la moyenne. */
const AU_NIVEAU = 2;

/** Depuis combien de temps la courbe court, en clair. */
function duree(tendance: PointTendance[]): string {
  return tendance.length < 60 ? 'depuis moins d’une minute' : `sur les ${Math.max(1, Math.round(tendance.length / 60))} dernières minutes`;
}

/** Le fait à retenir de la courbe, en une ligne : où en est l'efficacité face à sa moyenne de la semaine. */
function leconTendance(trs: number, trs7j: number): string | undefined {
  if (!(trs7j > 0)) return undefined;
  const ecart = Math.round((trs - trs7j) * 100);
  if (Math.abs(ecart) <= AU_NIVEAU) return `Au niveau de la moyenne 7 jours (${pct(trs7j)}).`;
  return `${Math.abs(ecart)} points ${ecart > 0 ? 'au-dessus' : 'en dessous'} de la moyenne 7 jours (${pct(trs7j)}).`;
}

/** Ce qui est simulé se dit : les chiffres tirés de l'historique de démonstration ne viennent pas de mesures réelles. */
const HISTORIQUE_SIMULE = 'Calculé sur l’historique simulé de la démonstration.';

export function ChiffresVolet({ fermer, atelier, bonnes, gache, cadence, arretsJour, trs, trs7j, tendance }: Props) {
  const total = bonnes + gache;
  const bas = tendance.length ? Math.max(0, Math.floor((Math.min(...tendance.map((p) => p.v), trs7j * 100) - 8) / 10) * 10) : 0;
  const etats = ORDRE.filter((e) => atelier.parEtat[e].length > 0);

  const chiffres: ChiffreSecondaire[] = [
    { label: 'Étiquettes produites', valeur: nf.format(bonnes), aide: 'Bonnes étiquettes, comptées depuis l’ouverture de la page.' },
    ...(cadence > 0 ? [{ label: 'Cadence', valeur: nf.format(cadence), unite: '/ h', aide: 'Étiquettes par heure, sur la dernière minute.' }] : []),
    {
      label: 'Étiquettes jetées',
      terme: 'gache',
      valeur: total > 0 ? (Math.round((gache / total) * 1000) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '…',
      unite: '%',
      aide: 'Part de la production jetée, réglages compris, depuis l’ouverture de la page.',
    },
    { label: 'Arrêts sur panne', valeur: fmtDuration(arretsJour), aide: `Aujourd’hui, toutes machines confondues, depuis minuit. ${HISTORIQUE_SIMULE}` },
    { label: 'Efficacité 7 jours', terme: 'trs', valeur: Math.round(trs7j * 100), unite: '%', aide: `Pour comparer avec le moment. ${HISTORIQUE_SIMULE}` },
  ];
  const lecon = leconTendance(trs, trs7j);
  const libelle = `L’efficacité de l’atelier seconde par seconde, ${duree(tendance)}.${lecon ? ` ${lecon}` : ''}`;

  return (
    <Volet titre="Plus de chiffres" icone={BarChart3} fermer={fermer}>
      <ChiffresSecondaires items={chiffres} label="La production et la journée" className="sv-volet-chiffres" />
      {/* Les arrêts du jour et l'efficacité de la semaine viennent de l'historique simulé : la mention reste visible. */}
      <p className="sv-volet-simule">
        <SimulatedChip />
      </p>

      <section className="sv-volet-section">
        <TitreCarte
          titre="Efficacité des dernières minutes"
          terme="trs"
          aide={`Seconde par seconde, ${duree(tendance)}. Le pointillé marque la moyenne des 7 derniers jours.`}
          lecon={lecon}
        />
        <div className="sv-tendance" role="img" aria-label={libelle}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={tendance} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(t: number) => hm.format(t)}
                tick={{ fontSize: 11, fill: 'var(--text-3)' }}
                tickLine={false}
                axisLine={{ stroke: 'var(--grid)' }}
                minTickGap={56}
                height={24}
              />
              <YAxis domain={[bas, 100]} tickCount={3} tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => `${Math.round(v)}\u00a0%`} />
              {trs7j > 0 && <ReferenceLine y={Math.round(trs7j * 1000) / 10} stroke="var(--text-3)" strokeDasharray="4 3" strokeWidth={1.2} ifOverflow="extendDomain" />}
              <Tooltip
                cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="chart-tip">
                      <b>{String(payload[0].value).replace('.', ',')} %</b>
                      <span className="faint"> · {hm.format((payload[0].payload as PointTendance).t)}</span>
                    </div>
                  ) : null
                }
              />
              <Area type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} fill="var(--series-1)" fillOpacity={0.12} isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {trs7j > 0 && (
          <p className="sv-legende">
            <span>
              <i className="sv-legende-courbe" /> Maintenant
            </span>
            <span>
              <i className="sv-legende-moyenne" /> Moyenne 7 jours
            </span>
          </p>
        )}
      </section>

      <section className="sv-volet-section">
        <TitreCarte titre="Les machines, par état" />
        <ul className="sv-volet-etats">
          {etats.map((e) => (
            <li key={e}>
              <span className={`st st-${e}`}>
                <StatusIcon etat={e} size={12} animate={false} />
              </span>
              <b>{ETAT_MOT[e]}</b>
              <span className="muted">{atelier.parEtat[e].map((m) => m.numero).join(', ')}</span>
            </li>
          ))}
          {atelier.horsLigne.length > 0 && (
            <li>
              <span className="st st-arret">
                <StatusIcon etat="arret" size={12} animate={false} />
              </span>
              <b>{MOT_HORS_LIGNE}</b>
              <span className="muted">{atelier.horsLigne.map((m) => m.numero).join(', ')}</span>
            </li>
          )}
        </ul>
      </section>
    </Volet>
  );
}
