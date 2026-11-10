/** Historique : la semaine de l'atelier racontée en clair (arrêts, efficacité, mesures, alarmes), en pleine page. */
import { Zone } from '@/widgets/shell/zones';
import { HistoryView } from './features/HistoryView';
import './index.css';

export function HistoriquePage() {
  return (
    <Zone nom="pleine-page">
      <HistoryView />
    </Zone>
  );
}
