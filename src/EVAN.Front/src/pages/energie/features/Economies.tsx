/**
 * Où économiser : les actions rangées de la plus rentable à la moins rentable. Chaque ligne dit quoi faire, ce que ça
 * rapporterait sur un an et sa barre ; un clic ouvre le volet qui dit pourquoi et refait le calcul, étape par étape.
 */
import { useCallback, useState, type CSSProperties } from 'react';
import { Calculator, ChevronRight } from 'lucide-react';
import { AnimatedNumber } from '@/ui/anim';
import { TitreCarte } from '@/ui/explain';
import type { ActionEco } from '../lib/economies';
import { euros, kwh, pourcent, prixKwh } from '../lib/format';
import { Volet } from './Volet';

interface Props {
  actions: ActionEco[];
  prix: number;
  style?: CSSProperties;
}

function DetailAction({ action, fermer }: { action: ActionEco; fermer: () => void }) {
  return (
    <Volet surtitre="Où économiser" titre={action.titre} icone={<Calculator />} fermer={fermer}>
      <p className="guide-resume">{action.pourquoi}</p>
      <p className="en-volet-gain">
        <b className="num">{euros(action.euroAn)}</b> par an
        <span className="faint">
          {' '}
          · {kwh(action.kwhAn)} · {pourcent(action.part, 1)} de l’électricité de l’usine
        </span>
      </p>
      <h3 className="en-volet-titre">Le calcul</h3>
      <ol className="en-calcul">
        {action.calcul.map((ligne, i) => (
          <li key={ligne} style={{ ['--i' as string]: i }}>
            {ligne}
          </li>
        ))}
      </ol>
      <p className="en-volet-hyp">On suppose que la période observée se répète toute l’année.</p>
      <h3 className="en-volet-titre">Comment s’y prendre</h3>
      <p className="en-volet-conseil">{action.conseil}</p>
    </Volet>
  );
}

export function Economies({ actions, prix, style }: Props) {
  const [ouverte, setOuverte] = useState<string>();
  const fermer = useCallback(() => setOuverte(undefined), []);
  const action = actions.find((a) => a.cle === ouverte);
  const max = Math.max(1, ...actions.map((a) => a.euroAn));

  return (
    <section className="card span-5 en-economies entree" data-guide="economies" data-tour="gisements" style={style} aria-labelledby="en-economies-titre">
      <TitreCarte
        titre="Où économiser"
        id="en-economies-titre"
        aide={`De la plus rentable à la moins rentable, ramenées à un an au prix de ${prixKwh(prix)} le kWh. Chaque action ouvre son calcul pas à pas.`}
        lecon={actions.length ? undefined : 'Aucune piste d’économie sur cette période : rien n’est parti hors production.'}
      />
      {actions.length > 0 && (
        <ol className="en-actions">
          {actions.map((a, i) => (
            <li key={a.cle} style={{ ['--i' as string]: i }}>
              <button type="button" className="en-action" onClick={() => setOuverte(a.cle)} aria-haspopup="dialog">
                <span className="en-action-rang num" aria-hidden>
                  {i + 1}
                </span>
                <b className="en-action-titre">{a.titre}</b>
                <span className="en-action-gain">
                  <b>
                    <AnimatedNumber value={a.euroAn} format={euros} />
                  </b>
                  <small>par an</small>
                </span>
                <ChevronRight className="en-action-chevron" aria-hidden />
                <span className="en-action-barre" aria-hidden>
                  <i style={{ transform: `scaleX(${a.euroAn / max})` }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {action && <DetailAction action={action} fermer={fermer} />}
    </section>
  );
}
