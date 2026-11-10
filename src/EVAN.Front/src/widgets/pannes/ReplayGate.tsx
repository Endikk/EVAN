/**
 * « Revoir la panne », monté par l'espace de travail sur tous les écrans. Le rejeu et ses graphiques (recharts) se
 * chargent une fois l'écran affiché et le navigateur au repos : prêts avant le premier clic, sans retarder l'écran.
 */
import { lazy, Suspense, useEffect } from 'react';
import { useUi } from '@/store/ui';
import { quandAuRepos } from '@/ui/repos';

const charger = () => import('./ReplayDialog');
const Replay = lazy(() => charger().then((m) => ({ default: m.Replay })));

export function ReplayDialog() {
  const alarme = useUi((s) => s.replay);
  // Un chargement manqué (réseau) n'est pas une erreur : il est retenté à l'ouverture.
  useEffect(() => quandAuRepos(() => void charger().catch(() => undefined)), []);
  if (!alarme) return null;
  return (
    <Suspense fallback={null}>
      <Replay key={alarme.id} alarme={alarme} />
    </Suspense>
  );
}
