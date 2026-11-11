/**
 * Temps 4 : relier chaque variable de l'automate au point de mesure qui lui correspond. Chaque variable montre son
 * nom et son point relié ; ce qu'elle contient s'ouvre depuis son nom. Une variable reliée se coche, et celles que
 * l'association automatique vient de relier s'allument une fois. Les adresses techniques (tableau complet) restent
 * repliées.
 */
import { useMemo } from 'react';
import { Check, Link2, ListChecks } from 'lucide-react';
import type { MachineModel } from '@/domain/catalog';
import { Details } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { Select, type GroupeChoix, type OptionChoix } from '@/ui/Select';
import { nbReliees, type Association, type Variable } from '../lib/variables';

interface Props {
  vars: Variable[];
  assoc: Association;
  model: MachineModel;
  relier: (variableId: string, pointId: string | undefined) => void;
  associerAuto: () => void;
}

/** Les points de mesure qu'on peut relier, rangés par organe ; « Pas reliée » en tête. */
function choixPoints(model: MachineModel): (OptionChoix | GroupeChoix)[] {
  const groupes = model.organes
    .map((o) => ({ groupe: `#${o.numero} ${o.nom}`, options: model.points.filter((p) => p.organeId === o.id).map((p) => ({ value: p.id, label: p.libelle })) }))
    .filter((g) => g.options.length > 0);
  return [{ value: '', label: 'Pas reliée' }, ...groupes];
}

function LigneVariable({ v, pointId, points, relier }: { v: Variable; pointId?: string; points: (OptionChoix | GroupeChoix)[]; relier: Props['relier'] }) {
  return (
    <li className={`cx-var ${pointId ? 'reliee' : ''}`}>
      {/* La clé suit le point relié : la coche se redessine chaque fois que l'association change. */}
      <span key={pointId ?? 'aucun'} className="cx-var-etat" aria-hidden>
        {pointId && <Check />}
      </span>
      <div className="cx-var-corps">
        <p className="cx-var-nom">
          <InfoTip label={`Comprendre : ${v.nom}`} texte={<span className="mono">{v.nom}</span>}>
            <p>{v.sens}</p>
          </InfoTip>
        </p>
        <label className="cx-var-point">
          <Link2 aria-hidden />
          <span className="sr-only">Point de mesure relié à {v.nom}</span>
          <Select taille="sm" value={pointId ?? ''} onChange={(x) => relier(v.id, x || undefined)} options={points} />
        </label>
      </div>
    </li>
  );
}

export function Variables({ vars, assoc, model, relier, associerAuto }: Props) {
  const reliees = nbReliees(vars, assoc);
  const points = useMemo(() => choixPoints(model), [model]);
  return (
    <div className="cx-pas" data-guide="connexion-variables">
      <div className="cx-progres">
        <button type="button" className="btn sm" onClick={associerAuto}>
          <ListChecks aria-hidden /> Associer automatiquement
        </button>
        <span>
          <b className="num">{reliees}</b> reliée{reliees > 1 ? 's' : ''} sur <span className="num">{vars.length}</span>
        </span>
        <span className="cx-jauge" aria-hidden>
          <i style={{ transform: `scaleX(${vars.length ? reliees / vars.length : 0})` }} />
        </span>
      </div>

      <ul className="cx-vars">
        {vars.map((v) => (
          <LigneVariable key={v.id} v={v} pointId={assoc[v.id]?.pointId} points={points} relier={relier} />
        ))}
      </ul>

      <Details titre="Voir les adresses techniques" apercu="pour l’automaticien">
        <dl className="cx-adresses">
          {vars.map((v) => (
            <div key={v.id}>
              <dt className="mono">{v.nom}</dt>
              <dd className="mono">
                {v.id} <span className="faint">({v.type})</span>
              </dd>
            </div>
          ))}
        </dl>
      </Details>
    </div>
  );
}
