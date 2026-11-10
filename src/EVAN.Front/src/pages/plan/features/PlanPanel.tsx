/**
 * Panneau de l'étape 2 : ce qu'il reste à faire (liste qui se coche seule, chaque aide dans son « ? »), la vue (3D
 * ou 2D, son usage dans le « ? »), la hauteur des bâtiments, puis les zones de l'atelier.
 */
import type { ReactNode } from 'react';
import { Box, Square } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { GuideButton, StepGuide, type Tache } from '@/ui/explain';
import { switchView } from '@/widgets/scene/planView';
import { InfoTip } from '@/ui/InfoTip';
import { PanelHeader } from '@/widgets/shell/PanelHeader';
import { useHauteursVerifiees } from '../lib/hauteurs';
import { typesDistincts } from '../lib/typesZone';
import { GUIDE_PLAN } from './guide';
import { HauteursCard } from './HauteursCard';
import { ZonesCard } from './ZonesCard';

const cascade = (i: number) => ({ ['--i' as string]: i });

export function PlanPanel() {
  const mode = useProject((s) => s.mode);
  const batiments = useProject((s) => s.batiments);
  const zones = useProject((s) => s.zones);
  const view = useUi((s) => s.view);
  const verifiees = useHauteursVerifiees((s) => s.ids);

  // L'usine d'exemple a déjà ses hauteurs vérifiées ; ailleurs, chacune doit avoir été regardée.
  const estVerifiee = (id: string) => mode === 'demo' || verifiees.includes(id);
  const hauteursOk = batiments.length > 0 && batiments.every((b) => estVerifiee(b.id));

  const taches: Tache[] = [
    {
      label: (
        <AvecAide fait={hauteursOk} label={batiments.length > 1 ? 'Vérifier chaque hauteur' : 'Vérifier la hauteur'}>
          Réglez le curseur en regardant la 3D, ou confirmez la valeur proposée.
        </AvecAide>
      ),
      fait: hauteursOk,
    },
    {
      label: (
        <AvecAide fait={zones.length > 0} label="Dessiner une première zone">
          L’atelier, par exemple : choisissez un type de zone plus bas, puis tracez un rectangle sur le plan.
        </AvecAide>
      ),
      fait: zones.length > 0,
    },
    {
      label: (
        <AvecAide fait={typesDistincts(zones) >= 2} label="Ajouter les autres zones">
          Stock, expédition… chaque partie de l’atelier dans sa zone : le plan se lit d’un coup d’œil.
        </AvecAide>
      ),
      fait: typesDistincts(zones) >= 2,
      facultatif: true,
    },
  ];

  return (
    <>
      <PanelHeader n={2} right={<GuideButton guide={GUIDE_PLAN} compact />} />
      <div className="panel-body stack pln-panneau">
        <div className="entree" style={cascade(0)}>
          <StepGuide taches={taches} fin="Tout est fait." />
        </div>

        <div className="pln-vue entree" style={cascade(1)} data-guide="vue">
          <div className="seg" role="group" aria-label="Vue du plan">
            <button type="button" aria-pressed={view === '3d'} onClick={() => void switchView('3d')}>
              <Box /> Vue 3D
            </button>
            <button type="button" aria-pressed={view === '2d'} onClick={() => void switchView('2d')}>
              <Square /> Plan 2D
            </button>
          </div>
          <InfoTip label="3D ou 2D : laquelle choisir">
            <p>La 3D montre le bâtiment en volume : c’est là qu’on juge sa hauteur.</p>
            <p>Le plan 2D, vu de dessus et à l’échelle, sert à dessiner les zones.</p>
          </InfoTip>
        </div>

        <HauteursCard estVerifiee={estVerifiee} style={cascade(2)} />
        <ZonesCard style={cascade(3)} />
      </div>
    </>
  );
}

/**
 * Le libellé d'une tâche et, tant qu'elle n'est pas faite, son « ? » qui dit comment la faire. Une fois faite,
 * l'aide n'a plus d'objet.
 */
function AvecAide({ label, fait, children }: { label: string; fait: boolean; children: ReactNode }) {
  return (
    <>
      {label}
      {!fait && (
        <InfoTip label={`Comment faire : ${label}`}>
          <p>{children}</p>
        </InfoTip>
      )}
    </>
  );
}
