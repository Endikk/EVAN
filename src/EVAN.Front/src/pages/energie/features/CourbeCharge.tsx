/**
 * Courbe de charge : la puissance tirée par l'usine au fil du temps, à l'encre du texte (elle mène l'écran). Les
 * bandes grisées sont les creux lus dans les données (rien ne produit ni ne se règle) : la nuit, le week-end. Ce qui
 * reste au-dessus de zéro dans une bande, c'est la veille. Le pic, un filet à sa hauteur, fixe la puissance à souscrire.
 *
 * À l'écran : le titre, une ligne de leçon et la légende (qui porte la valeur du pic). La lecture du graphique est dans
 * le « ? » ; la phrase complète reste pour les lecteurs d'écran.
 */
import type { CSSProperties } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TitreCarte } from '@/ui/explain';
import { fmtNombre } from '@/ui/format';
import { uniteAxe } from '@/widgets/charts/axes';
import { graduations, type LectureCourbe, type PointCharge } from '../lib/courbe';
import { fmtHeure, fmtJourCourt, fmtMoment, kw, kwh } from '../lib/format';

/** Graduations : la règle CSS de styles/graphiques.css (mono 11 px, --text-3) passe devant ces attributs. */
const AXE = { fontSize: 11, fill: 'var(--text-3)' };

/** Lecture du graphique, dans le « ? » du titre. */
function aideCourbe(l: LectureCourbe): string {
  const veille = l.talon !== undefined ? `, ${kwh(l.kwhCreux)} sur la période` : '';
  const quand = l.pic ? ` (${fmtMoment(l.pic.t)})` : '';
  return `Dans les bandes grisées, rien ne produit : ce qui reste au-dessus de zéro est de la veille${veille}. Le pic, le trait fin horizontal${quand}, fixe la puissance à souscrire.`;
}

interface Props {
  points: PointCharge[];
  lecture: LectureCourbe;
  /** Phrase complète, lue par les lecteurs d'écran. */
  phrase: string;
  /** Une ligne, à l'écran. */
  lecon: string;
  /** Plusieurs jours : graduations à minuit ; une journée : toutes les 3 heures. */
  surPlusieursJours: boolean;
  style?: CSSProperties;
}

/** Nom du creux écrit en haut de sa bande, seulement si la bande est assez large pour le porter. */
function EtiquetteCreux({ viewBox, texte }: { viewBox?: { x?: number; y?: number; width?: number }; texte: string }) {
  const largeur = viewBox?.width ?? 0;
  if (largeur < texte.length * 6.5 + 8) return null;
  return (
    <text x={(viewBox?.x ?? 0) + largeur / 2} y={(viewBox?.y ?? 0) + 16} textAnchor="middle" fontSize={11} fill="var(--text-3)">
      {texte}
    </text>
  );
}

export function CourbeCharge({ points, lecture, phrase, lecon, surPlusieursJours, style }: Props) {
  const from = points[0]?.t ?? 0;
  const to = points.length ? points[points.length - 1].t : 0;
  const ticks = graduations(from, to);
  const pic = lecture.pic;
  return (
    <section className="card span-8 en-courbe entree" data-guide="courbe-charge" data-tour="courbe-charge" style={style} aria-labelledby="en-courbe-titre">
      <TitreCarte titre="Courbe de charge" id="en-courbe-titre" terme="courbeCharge" aide={aideCourbe(lecture)} lecon={lecon} />
      <div className="chart-legend en-legende" role="list">
        <span role="listitem">
          <i className="en-leg-trait" />
          <b>Puissance tirée</b>
        </span>
        {lecture.creux.length > 0 && (
          <span role="listitem">
            <i className="en-leg-creux" />
            <b>Rien ne produit</b>
          </span>
        )}
        {pic && (
          <span role="listitem">
            <i className="en-leg-pic" />
            <b>Pic</b> <span className="num">{kw(pic.kw)}</span>
          </span>
        )}
      </div>
      <div className="chart en-courbe-chart" role="img" aria-label={`Courbe de charge. ${phrase}`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            {lecture.creux.map((c) => (
              <ReferenceArea
                key={c.debut}
                x1={c.debut}
                x2={c.fin}
                fill="var(--bande)"
                fillOpacity={1}
                stroke="none"
                ifOverflow="hidden"
                label={(p: { viewBox?: { x?: number; y?: number; width?: number } }) => <EtiquetteCreux viewBox={p.viewBox} texte={c.nature} />}
              />
            ))}
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={ticks}
              tickFormatter={(t: number) => (surPlusieursJours ? fmtJourCourt(t) : fmtHeure(t))}
              tick={AXE}
              tickLine={false}
              axisLine={{ stroke: 'var(--grid)' }}
              minTickGap={16}
            />
            <YAxis
              tick={AXE}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => fmtNombre(v)}
              label={uniteAxe('kW')}
            />
            {pic && <ReferenceLine y={pic.kw} stroke="var(--text-3)" strokeWidth={1} />}
            <Tooltip
              cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as PointCharge;
                return (
                  <div className="chart-tip" style={{ position: 'static' }}>
                    <div className="faint">{fmtMoment(p.t)}</div>
                    <b>{fmtNombre(p.kw)} kW</b>
                    {p.kwActif <= 1e-6 && <div className="faint">rien ne produit : veille</div>}
                  </div>
                );
              }}
            />
            {/* Un voile très léger sous la courbe : l'énergie est cette surface, mais c'est le trait qui se lit. */}
            <Area type="stepAfter" dataKey="kw" stroke="var(--series-1)" strokeWidth={1.5} fill="var(--series-1)" fillOpacity={0.06} isAnimationActive={false} dot={false} />
            {pic && <ReferenceDot x={pic.t} y={pic.kw} r={4.5} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} ifOverflow="visible" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
