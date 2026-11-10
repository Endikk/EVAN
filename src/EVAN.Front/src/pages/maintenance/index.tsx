/** Maintenance : le carnet, les échéances, les pannes rejouées et le diagnostic des défauts répétitifs. */
import { Zone } from '@/widgets/shell/zones';
import { MaintenanceView } from './features/MaintenanceView';
import './index.css';

export function MaintenancePage() {
  return (
    <Zone nom="pleine-page">
      <MaintenanceView />
    </Zone>
  );
}
