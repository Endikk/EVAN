/** Énergie : combien l'usine consomme, quand, ce qui part sans produire, et où économiser. */
import { Zone } from '@/widgets/shell/zones';
import { EnergyView } from './features/EnergyView';
import './index.css';

export function EnergiePage() {
  return (
    <Zone nom="pleine-page">
      <EnergyView />
    </Zone>
  );
}
