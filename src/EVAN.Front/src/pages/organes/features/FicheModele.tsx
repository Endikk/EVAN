/**
 * La fiche du modèle, d'un coup d'œil : quel modèle, d'où vient la fiche (son « ? » dit ce que vaut la source), et ce
 * qu'EVAN surveille sur cette machine en une rangée de chiffres. Ce qui reste à vérifier sur place reste en vue ; les
 * caractéristiques du kit et sa description, longues et rarement utiles ici, sont repliées.
 */
import { HelpCircle, ShieldCheck } from 'lucide-react';
import { useLive } from '@/store/live';
import type { MachineModel, TypeMachineDef } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { ChiffresSecondaires, Details, type ChiffreSecondaire } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { A_VERIFIER, FIABILITE, intitule } from '../lib/fiche';

/** Nombre de mesures en attention et en alarme, sous forme de texte stable : la fiche ne se redessine que s'il change. */
function useAlertes(points: MachineModel['points']): { attention: number; alarme: number; lues: number } {
  const cle = useLive((s) => {
    let attention = 0;
    let alarme = 0;
    let lues = 0;
    for (const p of points) {
      const n = s.values[p.id]?.niveau;
      if (!n) continue;
      lues++;
      if (n === 'attention') attention++;
      if (n === 'alarme') alarme++;
    }
    return `${attention}|${alarme}|${lues}`;
  });
  const [attention, alarme, lues] = cle.split('|').map(Number);
  return { attention, alarme, lues };
}

function useChiffres(model: MachineModel): ChiffreSecondaire[] {
  const { attention, alarme, lues } = useAlertes(model.points);
  const items: ChiffreSecondaire[] = [
    { label: 'Organes', valeur: model.organes.length, terme: 'organe' },
    { label: 'Mesures', valeur: model.points.length, terme: 'pointMesure' },
  ];
  // Hors plage : seulement quand des valeurs remontent ; la couleur n'apparaît que si une mesure sort de sa plage.
  if (lues) {
    items.push({
      label: 'Hors plage',
      valeur: attention + alarme,
      aide: `Mesures sorties de leur plage normale en ce moment : ${attention} en attention, ${alarme} en alarme, sur ${lues} lues.`,
      ton: alarme ? 'crit' : attention ? 'warn' : undefined,
    });
  }
  return items;
}

export function FicheModele({ machine, model, type }: { machine: Machine; model: MachineModel; type: TypeMachineDef }) {
  const fiab = FIABILITE[type.fiabilite.niveau] ?? { mot: type.fiabilite.libelle, sens: '' };
  const carac = Object.entries(type.caracteristiques).filter(([k]) => k !== A_VERIFIER);
  const aVerifier = type.caracteristiques[A_VERIFIER];
  // Une fiche déduite est à confirmer : elle seule prend la couleur d'attention. Une source sûre reste calme.
  const tonFiab = type.fiabilite.niveau === 'deduit' ? 'warn' : '';
  const chiffres = useChiffres(model);

  return (
    <section className="card og-fiche" aria-labelledby="og-fiche-titre" data-guide="organes-fiche">
      <header className="og-fiche-tete">
        <div className="grow">
          <p className="og-fiche-sur">
            <span className="mono">{machine.numero}</span> · {type.libelle}
          </p>
          <h3 id="og-fiche-titre">{type.nomKit}</h3>
        </div>
        <span className="og-fiche-source">
          <span className={`chip ${tonFiab}`}>
            <ShieldCheck aria-hidden /> {fiab.mot}
          </span>
          {fiab.sens && (
            <InfoTip label={`Comprendre : ${fiab.mot}`}>
              <p>{fiab.sens}</p>
            </InfoTip>
          )}
        </span>
      </header>

      <ChiffresSecondaires items={chiffres} label={`Ce qu’EVAN surveille sur ${machine.numero}`} className="og-fiche-chiffres" />

      {aVerifier && (
        <p className="og-a-verifier">
          <HelpCircle aria-hidden />
          <span>
            <b>À vérifier sur place :</b> {aVerifier.charAt(0).toLowerCase() + aVerifier.slice(1)}.
          </span>
        </p>
      )}

      <Details titre="Caractéristiques du modèle" apercu={carac.length ? `${carac.length}` : undefined}>
        <p className="og-texte og-procede">{type.procede}</p>
        {carac.length > 0 && (
          <dl className="og-carac">
            {carac.map(([k, v]) => (
              <div key={k}>
                <dt>{intitule(k)}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="og-texte">{type.description}</p>
      </Details>
    </section>
  );
}
