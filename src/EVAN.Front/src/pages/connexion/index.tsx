/** Étape 5 · Connexion : protocole, test de la liaison et variables lues sur chaque machine. */
import { Zone } from '@/widgets/shell/zones';
import { ConnectPanel } from './features/ConnectPanel';
import './index.css';

export function ConnexionPage() {
  return (
    <Zone nom="panneau">
      <ConnectPanel />
    </Zone>
  );
}
