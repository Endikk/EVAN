/**
 * Où part l'énergie : une liste classée, une ligne par état, avec sa barre fine qui se remplit jusqu'à sa part. Chaque
 * état garde sa couleur et sa forme dans tout EVAN (rond plein : production, losange : réglage, rond creux : veille,
 * carré : panne).
 *
 * La production est en vert (--ok), la couleur de « machine en marche » sur la supervision : l'œil retrouve le même
 * code d'un écran à l'autre, et le vert dit « énergie utile » face aux pertes. La courbe de charge, à côté, reste à
 * l'encre : elle montre la puissance totale, qui n'est pas un état.
 */
import type { CSSProperties } from 'react';
import type { BilanUsine } from '@/analytics/energy';
import { TitreCarte } from '@/ui/explain';
import { StatusIcon } from '@/ui/status';
import { kwh, pourcent } from '../lib/format';
import { ETATS, LIBELLE, phraseRepartition } from '../lib/lecture';

/** Ce que range chaque ligne, et le code des formes : dans le « ? » du titre. */
const AIDE =
  'Chaque kWh est rangé selon ce que faisait la machine : produire, se régler (calage : clichés, encres, bobine), attendre en veille ou rester en panne sous tension. Formes et couleurs sont celles des machines sur la supervision.';

export function Repartition({ bilan, style }: { bilan: BilanUsine; style?: CSSProperties }) {
  const total = bilan.total.total;
  return (
    <section className="card span-4 en-repartition entree" data-guide="repartition" style={style} aria-labelledby="en-repartition-titre">
      <TitreCarte titre="Où part l’énergie" id="en-repartition-titre" aide={AIDE} lecon={phraseRepartition(bilan)} />
      <ul className="en-parts">
        {ETATS.map((e, i) => {
          const part = total > 0 ? bilan.total.kwh[e] / total : 0;
          return (
            <li key={e} className={`st st-${e}`} style={{ ['--i' as string]: i }}>
              <div className="en-part-tete">
                <StatusIcon etat={e} size={11} animate={false} />
                <span className="en-part-nom">{LIBELLE[e]}</span>
                <span className="en-part-kwh num">{kwh(bilan.total.kwh[e])}</span>
                <b className="num">{pourcent(part, part > 0 && part < 0.1 ? 1 : 0)}</b>
              </div>
              <div className="en-part-barre" aria-hidden>
                <i style={{ transform: `scaleX(${part})` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
