import { Link } from 'react-router';
import { EvanLogo } from '@/ui/EvanLogo';
import type { BrandStatus } from '@/ui/brand';
import { useLive } from '@/store/live';

/** État de l'atelier pour le point du logo : rouge si une machine est en panne, orange si une est en alerte. */
export function usePlantStatus(): BrandStatus {
  return useLive((s) => {
    const etats = Object.values(s.machines).map((m) => m.etat);
    return etats.includes('panne') ? 'crit' : etats.includes('attention') ? 'warn' : 'ok';
  });
}

export function Brand() {
  const status = usePlantStatus();
  return (
    <Link to="/" className="brand" aria-label="EVAN, accueil">
      <EvanLogo size={27} status={status} pulse={status !== 'ok'} />
    </Link>
  );
}
