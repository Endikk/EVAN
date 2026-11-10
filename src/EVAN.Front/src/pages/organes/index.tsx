/** Étape 4 · Organes : les organes de chaque machine et leurs points de mesure. */
import { Zone } from '@/widgets/shell/zones';
import { OrgansPanel } from './features/OrgansPanel';
import './index.css';

export function OrganesPage() {
  return (
    <Zone nom="panneau">
      <OrgansPanel />
    </Zone>
  );
}
