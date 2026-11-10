/**
 * Comparer les usines : l'efficacité jour par jour, les pannes qui ont coûté le plus de temps, et les mêmes machines
 * d'une usine à l'autre. Chaque bloc : son titre, la méthode dans le « ? », une ligne qui en tire la leçon. Composant
 * mémorisé : le direct de l'usine ouverte ne le redessine pas.
 */
import { memo, useMemo, type CSSProperties } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { comparerTypes } from '@/analytics/organisation';
import { useReducedMotion } from '@/store/ui';
import { Details, TitreCarte } from '@/ui/explain';
import { fmtDay, fmtNombre, pct } from '@/ui/format';
import { arretsLesPlusLongs, type Ligne } from '../lib/donnees';
import { ecartsParType, fr, leconArrets, leconComparables, leconEfficacite, TRS_POINTE } from '../lib/lecture';

/** Forme du point de chaque usine : la couleur n'est jamais seule pour les distinguer. */
export function FormeUsine({ i, couleur }: { i: number; couleur: string }) {
  const f = i % 4;
  return (
    <svg className="org-forme" viewBox="0 0 12 12" width="12" height="12" aria-hidden style={{ color: couleur }}>
      {f === 0 && <circle cx="6" cy="6" r="4.6" fill="currentColor" />}
      {f === 1 && <rect x="1.6" y="1.6" width="8.8" height="8.8" rx="1.6" fill="currentColor" />}
      {f === 2 && <path d="M6 0.8 11.2 6 6 11.2 0.8 6Z" fill="currentColor" />}
      {f === 3 && <path d="M6 1 11.2 10.6H0.8Z" fill="currentColor" />}
    </svg>
  );
}

/** Point d'une ligne du graphique, à la forme de son usine. */
function pointForme(i: number, couleur: string) {
  return function Point({ cx, cy, index }: { cx?: number; cy?: number; index?: number }) {
    if (cx === undefined || cy === undefined) return <g key={index} />;
    return (
      <g key={index} transform={`translate(${cx - 6} ${cy - 6})`} stroke="var(--surface)" strokeWidth={1.5}>
        <FormeUsine i={i} couleur={couleur} />
      </g>
    );
  };
}

function Legende({ lignes, reference = false }: { lignes: Ligne[]; reference?: boolean }) {
  return (
    <ul className="org-legende">
      {lignes.map((l, i) => (
        <li key={l.u.id}>
          <FormeUsine i={i} couleur={l.couleur} />
          {l.court}
        </li>
      ))}
      {reference && (
        <li className="org-legende-ref">
          <i aria-hidden /> Usine de pointe (85 %)
        </li>
      )}
    </ul>
  );
}

function EfficaciteJours({ lignes }: { lignes: Ligne[] }) {
  const reduit = useReducedMotion();
  const donnees = useMemo(() => {
    const parJour = new Map<number, Record<string, number>>();
    for (const l of lignes) for (const d of l.jours) parJour.set(d.t, { ...(parJour.get(d.t) ?? {}), [l.u.id]: Math.round(d.trs * 100) });
    return [...parJour.entries()].sort((a, b) => a[0] - b[0]).map(([t, v]) => ({ t, ...v }));
  }, [lignes]);
  const lecon = useMemo(() => leconEfficacite(lignes.map((l) => ({ court: l.court, jours: l.jours }))), [lignes]);

  return (
    <article className="card org-bloc" data-guide="org-trs-jours" aria-label="Efficacité des machines, jour par jour">
      <TitreCarte
        titre="Efficacité des machines, jour par jour"
        terme="trs"
        aide="Une ligne par usine, sur les 7 derniers jours. Le trait pointillé marque 85 %, le niveau d’une usine de pointe."
        lecon={fr(lecon)}
      />
      <Legende lignes={lignes} reference />
      <div className="org-courbe">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={donnees} margin={{ top: 10, right: 14, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="t" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: 'var(--text-3)' }} tickLine={false} axisLine={{ stroke: 'var(--grid)' }} minTickGap={12} />
            <YAxis
              domain={[(min: number) => Math.min(80, Math.max(0, Math.floor((min - 8) / 10) * 10)), 100]}
              tick={{ fontSize: 11, fill: 'var(--text-3)' }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => `${v} %`}
            />
            <ReferenceLine y={TRS_POINTE * 100} stroke="var(--text-3)" strokeDasharray="5 4" ifOverflow="extendDomain" />
            <Tooltip
              cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="chart-tip" style={{ position: 'static' }}>
                    <div className="faint">{fmtDay(Number(payload[0].payload.t))}</div>
                    {lignes.map((l, i) => {
                      const v = payload[0].payload[l.u.id] as number | undefined;
                      return v === undefined ? null : (
                        <div key={l.u.id} className="org-tip-ligne">
                          <FormeUsine i={i} couleur={l.couleur} />
                          <b>{v} %</b> <span className="faint">{l.court}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null
              }
            />
            {lignes.map((l, i) => (
              <Line
                key={l.u.id}
                name={l.court}
                type="monotone"
                dataKey={l.u.id}
                stroke={l.couleur}
                strokeWidth={2.5}
                strokeDasharray={i % 2 ? '7 4' : undefined}
                dot={pointForme(i, l.couleur)}
                activeDot={false}
                isAnimationActive={!reduit}
                animationDuration={900}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}

function ArretsLongs({ lignes }: { lignes: Ligne[] }) {
  const arrets = useMemo(() => arretsLesPlusLongs(lignes), [lignes]);
  const max = Math.max(0.001, ...arrets.map((a) => a.heures));
  const plusieurs = lignes.length > 1;
  const rang = useMemo(() => Object.fromEntries(lignes.map((l, i) => [l.court, i])), [lignes]);
  return (
    <article className="card org-bloc" data-guide="org-arrets" aria-label="Les pannes qui ont coûté le plus de temps">
      <TitreCarte
        titre="Les pannes qui ont coûté le plus de temps"
        aide="Chaque ligne réunit la même panne sur la même machine, sur 7 jours. La barre donne les heures perdues ; le nombre de fois dit si c’est une longue panne ou une petite qui revient."
        lecon={fr(leconArrets(arrets, lignes.length))}
      />
      {plusieurs && arrets.length > 0 && <Legende lignes={lignes} />}
      {arrets.length > 0 && (
        <ol className="org-arrets">
          {arrets.map((a, i) => (
            <li key={a.id} style={{ '--i': i } as CSSProperties}>
              <div className="org-arret-texte">
                <b>{a.message}</b>
                <span>
                  {plusieurs && (
                    <>
                      <FormeUsine i={rang[a.court] ?? 0} couleur={a.couleur} />
                      <span className="sr-only">{a.court}, </span>
                    </>
                  )}
                  {a.numero} · {a.machineNom} · {a.fois} fois
                </span>
              </div>
              <div className="org-arret-barre" aria-hidden>
                <i style={{ transform: `scaleX(${a.heures / max})` }} />
              </div>
              <b className="org-arret-h num">{fmtNombre(a.heures, 1)} h</b>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

/** Une règle d'efficacité commune à toutes les lignes, arrondie à 5 % autour des valeurs. */
function regle(valeurs: number[]) {
  const bas = Math.max(0, Math.floor((Math.min(...valeurs) - 0.03) * 20) / 20);
  const haut = Math.min(1, Math.ceil((Math.max(...valeurs) + 0.03) * 20) / 20);
  return { bas, haut, x: (v: number) => ((v - bas) / (haut - bas || 1)) * 100 };
}

function MemesMachines({ lignes }: { lignes: Ligne[] }) {
  const comparaison = useMemo(() => comparerTypes(lignes.map((l) => ({ id: l.u.id, machines: l.u.machines, h: l.h, energie: l.r.energie }))), [lignes]);
  const ecarts = useMemo(() => ecartsParType(comparaison), [comparaison]);
  const noms = useMemo(() => Object.fromEntries(lignes.map((l) => [l.u.id, l.court])), [lignes]);
  const rang = useMemo(() => Object.fromEntries(lignes.map((l, i) => [l.u.id, i])), [lignes]);
  const seules = comparaison.filter((c) => Object.values(c.usines).filter(Boolean).length === 1);
  // Les types présents dans une seule usine sortent de la comparaison : le « ? » les nomme, le tableau les montre.
  const horsComparaison = seules
    .map((c) => {
      const id = Object.keys(c.usines).find((k) => c.usines[k]);
      return `${c.libelle.toLowerCase()} (${id ? noms[id] : ''})`;
    })
    .join(', ');
  const aide = `Un point par usine sur une même règle d’efficacité : plus ils sont loin, plus l’écart est grand.${
    horsComparaison ? ` Dans une seule usine, donc hors comparaison : ${horsComparaison}.` : ''
  }`;
  const r = ecarts.length ? regle(ecarts.flatMap((e) => e.valeurs.map((v) => v.trs))) : undefined;

  return (
    <article className="card org-bloc org-memes" data-tour="comparables" data-guide="org-comparables" aria-label="Mêmes machines, d’une usine à l’autre">
      <TitreCarte
        titre="Mêmes machines, d’une usine à l’autre"
        terme="trs"
        aide={fr(aide)}
        lecon={fr(leconComparables(ecarts, noms))}
      />
      {r && (
        <>
          <Legende lignes={lignes} />
          <ul className="org-ecarts">
            {ecarts.map((e) => {
              const v = e.valeurs.map((x) => x.trs);
              const lu = e.valeurs.map((x) => `${noms[x.usineId]} ${pct(x.trs)}`).join(', ');
              const points = Math.round(e.ecart * 100);
              return (
                <li key={e.type}>
                  <span className="org-ecart-type">{e.libelle}</span>
                  <div className="org-ecart-piste" role="img" aria-label={`${e.libelle} : ${lu}`}>
                    <i className="org-ecart-trait" style={{ left: `${r.x(Math.min(...v))}%`, width: `${r.x(Math.max(...v)) - r.x(Math.min(...v))}%` }} />
                    {e.valeurs.map((x) => (
                      <span key={x.usineId} className="org-ecart-point" style={{ left: `${r.x(x.trs)}%` }} title={`${noms[x.usineId]} : ${pct(x.trs)}`}>
                        <FormeUsine i={rang[x.usineId] ?? 0} couleur={lignes[rang[x.usineId] ?? 0]?.couleur ?? 'var(--text-2)'} />
                      </span>
                    ))}
                  </div>
                  <span className="org-ecart-valeur num">{points < 1 ? 'Pareil' : `${points} ${points > 1 ? 'points' : 'point'}`}</span>
                </li>
              );
            })}
          </ul>
          <div className="org-ecart-regle" aria-hidden>
            <span>{pct(r.bas)}</span>
            <span>{pct((r.bas + r.haut) / 2)}</span>
            <span>{pct(r.haut)}</span>
          </div>
        </>
      )}
      <Details titre="Voir le tableau complet" apercu="par type de machine">
        <div className="table-scroll">
          <table className="table org-table">
            <thead>
              <tr>
                <th>Type de machine</th>
                {lignes.map((l, i) => (
                  <th key={l.u.id} className="r">
                    <span className="org-th">
                      <FormeUsine i={i} couleur={l.couleur} /> {l.court}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {comparaison.map((c) => (
                <tr key={c.type}>
                  <th scope="row">{c.libelle}</th>
                  {lignes.map((l) => {
                    const v = c.usines[l.u.id];
                    return (
                      <td key={l.u.id} className="r num">
                        {v ? (
                          <>
                            <b>{pct(v.trs)}</b>
                            <span className="faint">
                              {' '}
                              · {v.machines} {v.machines > 1 ? 'machines' : 'machine'}
                              {v.intensite !== undefined ? ` · ${fmtNombre(v.intensite, v.intensite < 10 ? 2 : 0)} kWh pour 1 000 ${v.unite}` : ''}
                            </span>
                          </>
                        ) : (
                          <span className="faint">Aucune</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Details>
    </article>
  );
}

export const Comparaison = memo(function Comparaison({ lignes, rang }: { lignes: Ligne[]; rang: number }) {
  if (!lignes.length) return null;
  const plusieurs = lignes.length > 1;
  const titre = plusieurs ? 'Comparer les usines' : 'Votre usine sur 7 jours';
  return (
    <section className="org-comparer entree" style={{ '--i': rang } as CSSProperties} aria-label={titre}>
      <header className="org-section-tete">
        <TitreCarte niveau={2} titre={titre} aide={plusieurs ? 'Les 7 derniers jours, avec le même calcul pour chaque usine.' : 'Les 7 derniers jours.'} />
      </header>
      <div className="org-comparer-grille">
        <EfficaciteJours lignes={lignes} />
        <ArretsLongs lignes={lignes} />
        {plusieurs && <MemesMachines lignes={lignes} />}
      </div>
    </section>
  );
});
