/**
 * Commandes de la carte, posées sur la carte elle-même (au-dessus du zoom) : revenir sur tout le site, incliner la
 * vue pour voir les bâtiments en relief. Elles n'ont de sens qu'une fois un bâtiment relevé.
 */
import { Box, RotateCcw } from 'lucide-react';
import { useProject } from '@/store/project';
import { fitSite } from '@/widgets/carte/cadrage';
import { mapHandle, useMapUi } from '@/widgets/carte/mapState';

export function CommandesCarte() {
  const aBatiment = useProject((s) => s.batiments.length > 0);
  const relief = useMapUi((s) => s.pitch3d);
  // Pendant un tracé à la main, la carte ne doit pas bouger : le conseil du tracé prend la place.
  const dessin = useMapUi((s) => s.mode === 'draw');
  if (!aBatiment || dessin) return null;
  return (
    <div className="loc-commandes" role="group" aria-label="Vue de la carte">
      <button
        type="button"
        className="btn sm"
        onClick={() => mapHandle.map && fitSite(mapHandle.map, useProject.getState().batiments)}
        title="Cadrer la carte sur tous les bâtiments de l’usine"
      >
        <RotateCcw /> Recadrer
      </button>
      <button
        type="button"
        className={`btn sm ${relief ? 'active' : ''}`}
        aria-pressed={relief}
        onClick={() => useMapUi.getState().set({ pitch3d: !relief })}
        title="Incliner la carte pour voir les bâtiments en volume"
      >
        <Box /> Relief 3D
      </button>
    </div>
  );
}
