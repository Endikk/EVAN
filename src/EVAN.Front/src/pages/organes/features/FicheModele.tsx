/**
 * La fiche du modèle, d'un coup d'œil : le modèle du kit dont la machine reprend les organes, ce que vaut cette fiche
 * (son « ? » le dit), et ce qu'EVAN surveille sur cette machine en une rangée de chiffres. Ce qui reste à vérifier sur
 * place reste en vue ; les caractéristiques du kit et sa description, longues et rarement utiles ici, sont repliées.
 *
 * Le modèle du kit est une référence, pas l'identité de la machine posée : la fiche le dit (« modèle du kit », « organes
 * types, à adapter ») et propose « Ce n'est pas ma machine » pour revenir la changer.
 */
import { ArrowLeft, HelpCircle, ShieldCheck } from 'lucide-react';
import { estBranchee } from '@/store/avancement';
import { useLive } from '@/store/live';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import type { MachineModel, TypeMachineDef } from '@/domain/catalog';
import type { Machine } from '@/domain/types';
import { ChiffresSecondaires, Details, type ChiffreSecondaire } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { goToStep } from '@/widgets/shell/navigation';
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

function useChiffres(model: MachineModel, branchee: boolean): ChiffreSecondaire[] {
  const { attention, alarme, lues } = useAlertes(model.points);
  const items: ChiffreSecondaire[] = [
    { label: 'Organes', valeur: model.organes.length, terme: 'organe' },
    { label: 'Mesures', valeur: model.points.length, terme: 'pointMesure' },
  ];
  // Hors plage : seulement pour une machine branchée dont des valeurs remontent. Avant le branchement, les valeurs
  // viennent du simulateur et un « Hors plage 0 » ferait croire que la machine est déjà surveillée.
  if (branchee && lues) {
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
  const deduite = type.fiabilite.niveau === 'deduit';
  const tonFiab = deduite ? 'warn' : '';
  const branchee = useProject((s) => estBranchee(s.connexions[machine.id]));
  const chiffres = useChiffres(model, branchee);
  // Une machine du kit reprend toujours les organes de son modèle : à relire et à ajuster, sauf machine supposée.
  const puce = deduite ? 'À confirmer sur place' : 'Organes types, à adapter';

  return (
    <section className="card og-fiche" aria-labelledby="og-fiche-titre" data-guide="organes-fiche">
      <header className="og-fiche-tete">
        <div className="grow">
          <p className="og-fiche-sur">
            <span className="mono">{machine.numero}</span> · {type.libelle} · modèle du kit
          </p>
          <h3 id="og-fiche-titre">{type.nomKit}</h3>
        </div>
        <span className="og-fiche-source">
          {/* Le mot de la puce ouvre ce qu'il veut dire : pas de « ? » à côté d'une puce. */}
          <span className={`chip ${tonFiab}`}>
            <ShieldCheck aria-hidden />{' '}
            <InfoTip label={`Comprendre : ${puce}`} texte={puce}>
              <p>
                Les organes viennent du modèle du kit, {type.nomKit} : une référence pour ce type de machine, pas forcément la vôtre. Relisez la liste
                et ajustez les seuils à votre machine.
              </p>
              {fiab.sens && (
                <p>
                  <b>{fiab.mot} :</b> {fiab.sens.charAt(0).toLowerCase() + fiab.sens.slice(1)}
                </p>
              )}
            </InfoTip>
          </span>
        </span>
      </header>

      <ChiffresSecondaires items={chiffres} label={`Ce qu’EVAN surveille sur ${machine.numero}`} className="og-fiche-chiffres" />

      <p className="og-pas-ma-machine">
        <button
          type="button"
          className="btn sm ghost"
          title="Revenir à l’étape 3 : retirer cette machine et poser le bon type, ou importer son modèle 3D"
          onClick={() => {
            useUi.getState().selectMachine(machine.id);
            void goToStep(3);
          }}
        >
          <ArrowLeft aria-hidden /> Ce n’est pas ma machine
        </button>
      </p>

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
