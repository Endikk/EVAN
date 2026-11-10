/** Toutes les usines : vue d'ensemble de l'organisation, usines et machines comparées. */
import { Zone } from '@/widgets/shell/zones';
import { OrganisationView } from './features/OrganisationView';
import './index.css';

export function OrganisationPage() {
  return (
    <Zone nom="pleine-page">
      <OrganisationView />
    </Zone>
  );
}
