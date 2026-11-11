/**
 * Panneau de l'étape 2 : ce qu'il reste à faire (liste qui se coche seule ; comment faire s'ouvre depuis chaque
 * libellé), la vue (3D ou 2D, et à quoi sert chacune), la hauteur des bâtiments, puis les zones de l'atelier.
 */
import { Box, Square } from 'lucide-react';
import { useTachesConfig } from '@/store/avancement';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { GuideButton, StepGuide, type Tache } from '@/ui/explain';
import { switchView } from '@/widgets/scene/planView';
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
  const fait = useTachesConfig()[2];
  const view = useUi((s) => s.view);
  const verifiees = useHauteursVerifiees((s) => s.ids);

  // L'usine d'exemple a déjà ses hauteurs vérifiées ; ailleurs, chacune doit avoir été regardée. Les coches des
  // tâches viennent du calcul commun (store/avancement.ts), celui qui coche aussi l'étape dans le rail.
  const estVerifiee = (id: string) => mode === 'demo' || verifiees.includes(id);

  const taches: Tache[] = [
    {
      label: batiments.length > 1 ? 'Vérifier chaque hauteur' : 'Vérifier la hauteur',
      comment: 'Réglez le curseur en regardant la 3D, ou confirmez la valeur proposée.',
      fait: fait.hauteurs,
    },
    {
      label: 'Dessiner une première zone',
      comment: 'L’atelier, par exemple : choisissez un type de zone plus bas, puis tracez un rectangle sur le plan.',
      fait: fait.zone,
    },
    {
      label: 'Ajouter les autres zones',
      comment: 'Stock, expédition… chaque partie de l’atelier dans sa zone : le plan se lit d’un coup d’œil.',
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

        {/* L'usage de chaque vue tient en une ligne : elle reste en vue sous la commande, sans « ? ». */}
        <div className="pln-vue entree" style={cascade(1)} data-guide="vue">
          <div className="seg" role="group" aria-label="Vue du plan">
            <button type="button" aria-pressed={view === '3d'} onClick={() => void switchView('3d')}>
              <Box /> Vue 3D
            </button>
            <button type="button" aria-pressed={view === '2d'} onClick={() => void switchView('2d')}>
              <Square /> Plan 2D
            </button>
          </div>
          <p className="pln-vue-usage">La 3D sert à juger la hauteur, le plan 2D à dessiner les zones.</p>
        </div>

        <HauteursCard estVerifiee={estVerifiee} style={cascade(2)} />
        <ZonesCard style={cascade(3)} />
      </div>
    </>
  );
}
