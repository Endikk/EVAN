/**
 * Choix du bâtiment à partir d'un résultat de recherche : EVAN propose des bâtiments lettrés (A, B, C…) sur la carte
 * et dans le panneau ; un point GPS ou un numéro de rue qui tombe dans un bâtiment le retient d'office.
 */
import { localiser, type Candidate, type Localisation } from '@/geo/candidates';
import type { SearchResult } from '@/geo/search';
import { isReducedMotion } from '@/store/ui';
import { mapHandle, useMapUi } from './mapState';
import { margesCarte } from './marges';
import { emprise } from './cadrage';
import { computeFrame, fromLocal, labelPoint, toLocal, type LngLat } from '@/geo/geodesy';

let ctrl: AbortController | null = null;

/** Ce que fait EVAN pendant la recherche des bâtiments, dit à l'utilisateur qui attend. */
const ENCOURS: Record<SearchResult['precision'], string> = {
  gps: 'EVAN cherche le bâtiment sous ce point…',
  numero: 'EVAN cherche le bâtiment à ce numéro…',
  rue: 'EVAN cherche les bâtiments le long de la rue…',
  commune: 'EVAN centre la carte sur la commune…',
  entreprise: 'EVAN vérifie l’adresse de l’entreprise, puis cherche les bâtiments de la rue…',
  lieu: 'EVAN cherche les bâtiments autour de ce lieu…',
};

export function candidateAnchor(c: Candidate): LngLat {
  const frame = computeFrame(c.contour);
  return fromLocal(frame, labelPoint(c.contour.map((p) => toLocal(frame, p))));
}

export async function locate(r: SearchResult): Promise<Localisation | null> {
  ctrl?.abort();
  const c = new AbortController();
  ctrl = c;
  useMapUi.getState().set({ locating: ENCOURS[r.precision], localisation: undefined, hoverCandidate: undefined, detectError: undefined });
  try {
    const loc = await localiser(r, c.signal);
    if (c.signal.aborted) return null;
    useMapUi.getState().set({ locating: undefined, localisation: loc });
    return loc;
  } catch (e) {
    if (c.signal.aborted) return null;
    useMapUi.getState().set({
      locating: undefined,
      detectError: `Les bâtiments de cette adresse n’ont pas pu être chargés (${(e as Error).message}). Zoomez sur la photo et cliquez sur le toit de l’usine, ou dessinez son contour.`,
    });
    return null;
  }
}

export async function chooseCandidate(c: Candidate) {
  useMapUi.getState().set({ hoverCandidate: undefined });
  // La carte est affichée quand on choisit un bâtiment : son module est déjà chargé, l'import ne coûte rien. Statique,
  // il ferait charger MapLibre à tout l'espace de travail (la visite et le changement d'usine passent par ce fichier).
  const { addFootprint } = await import('./SiteMap');
  return addFootprint(c, candidateAnchor(c));
}

export function clearLocalisation() {
  ctrl?.abort();
  useMapUi.getState().set({ localisation: undefined, locating: undefined, hoverCandidate: undefined });
}

/** Cadre la carte sur les bâtiments proposés et le point d'adresse (pas sur toute la rue, qui peut être longue). */
export function fitLocalisation(loc: Localisation, opts: { duration?: number } = {}) {
  const map = mapHandle.map;
  const pts: LngLat[] = [loc.anchor, ...loc.candidates.flatMap((c) => c.contour)];
  if (!map || pts.length < 2) return;
  const cam = map.cameraForBounds(emprise(pts), { padding: margesCarte(map, 36) });
  if (!cam) return;
  map.easeTo({ center: cam.center, zoom: Math.min(cam.zoom ?? 17, 18.6), duration: isReducedMotion() ? 0 : (opts.duration ?? 1300) });
}
