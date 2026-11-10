/** Étape 3 · Machines : la bibliothèque, et la pose des machines sur le plan (glisser-déposer ou clic). */
import { Zone } from '@/widgets/shell/zones';
import { MachinesPanel } from './features/MachinesPanel';
import './index.css';

export function MachinesPage() {
  return (
    <Zone nom="panneau">
      <MachinesPanel />
    </Zone>
  );
}
