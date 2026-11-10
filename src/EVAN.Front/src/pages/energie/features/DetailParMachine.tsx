/**
 * « Voir l'énergie machine par machine », replié en bas de l'écran. Il s'ouvre seul dans deux cas : une machine a été
 * choisie depuis un autre écran, ou la visite guidée vient le désigner (sinon elle montrerait un bloc fermé).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { BilanUsine } from '@/analytics/energy';
import { Details } from '@/ui/explain';
import { kwh } from '../lib/format';
import { ParMachine } from './ParMachine';

interface Props {
  bilan: BilanUsine;
  selectedId?: string;
  style?: CSSProperties;
}

export function DetailParMachine({ bilan, selectedId, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [parLaVisite, setParLaVisite] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || parLaVisite) return;
    // La visite pose la classe tour-spot sur le bloc qu'elle montre : on n'observe que cet attribut, sur ce seul bloc.
    const obs = new MutationObserver(() => el.classList.contains('tour-spot') && setParLaVisite(true));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [parLaVisite]);

  const plusGourmande = bilan.parMachine.reduce<BilanUsine['parMachine'][number] | undefined>((a, x) => (!a || x.bilan.total > a.bilan.total ? x : a), undefined);
  const ouvert = parLaVisite || !!selectedId;

  return (
    <div ref={ref} className="span-12 en-plus entree" data-guide="par-machine" data-tour="energie-machines" style={style}>
      <Details
        key={ouvert ? 'ouvert' : 'ferme'}
        titre="Voir l’énergie machine par machine"
        apercu={plusGourmande ? `${plusGourmande.machine.numero} consomme le plus : ${kwh(plusGourmande.bilan.total)}` : undefined}
        ouvert={ouvert}
      >
        <ParMachine bilan={bilan} selectedId={selectedId} />
      </Details>
    </div>
  );
}
