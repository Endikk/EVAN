/** Étape 2 · Plan : le bâtiment en 3D extrudée ou en plan 2D, sa hauteur, et ses zones de production. */
import { Zone } from '@/widgets/shell/zones';
import { PlanPanel } from './features/PlanPanel';
import './index.css';

export function PlanPage() {
  return (
    <Zone nom="panneau">
      <PlanPanel />
    </Zone>
  );
}
