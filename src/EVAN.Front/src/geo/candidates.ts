/**
 * Localiser le bon bâtiment de façon fiable.
 *
 * Une adresse ne désigne pas toujours un bâtiment : « ZI du Menneton, avenue Thérèse Voisin » est un point posé sur la rue,
 * et la position SIRENE d'un établissement peut être décalée de plusieurs centaines de mètres.
 * Selon la précision du point, EVAN :
 *  - coordonnées GPS ou numéro de rue : relève le bâtiment sous le point ;
 *  - rue entière : prend la géométrie de la voie (BD TOPO, identifiant BAN) et propose les bâtiments
 *    qui la bordent, classés (grands, industriels, proches de la voie) ; l'utilisateur confirme ;
 *  - établissement SIRENE : re-géocode l'adresse postale et applique la règle correspondante,
 *    en signalant l'écart avec la position SIRENE.
 */
import { fromWfs, wfsQuery, type Footprint, type WfsFeature } from './footprint';
import { geodesicMeasure, pointInPolygon, type LngLat } from './geodesy';
import { geocodeAdresse, PRECISION_LIBELLE, type Precision, type SearchResult } from './search';

export interface Candidate extends Footprint {
  lettre: string;
  surface: number;
  /** Distance au point d'adresse ou à la voie (m). */
  distance: number;
  score: number;
  raison: string;
}

export interface Localisation {
  anchor: LngLat;
  precision: Precision;
  libelle: string;
  note?: string;
  candidates: Candidate[];
  /** Bâtiment retenu d'office (point dans un bâtiment). Sinon l'utilisateur choisit. */
  auto?: Candidate;
  rue?: LngLat[][];
}

const LETTRES = 'ABCDEF';

/** Mètres locaux (équirectangulaire) : suffisant pour classer des distances de quelques centaines de mètres. */
function projector(center: LngLat) {
  const kx = 111320 * Math.cos((center[1] * Math.PI) / 180);
  const ky = 110540;
  return (p: LngLat): [number, number] => [(p[0] - center[0]) * kx, (p[1] - center[1]) * ky];
}

function distPointSeg(p: [number, number], a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

const industriel = (f: Footprint) => /industri|commercial|agricole/i.test(`${f.usage ?? ''} ${f.nature ?? ''}`);

function rank(list: Footprint[], dist: (f: Footprint) => number, maxDist: number, raison: (f: Footprint, d: number) => string): Candidate[] {
  return list
    .map((f) => {
      const surface = geodesicMeasure(f.contour).area;
      const d = dist(f);
      // Un site de production est le plus souvent le grand bâtiment industriel de la parcelle : la taille (√surface,
      // proportionnelle à la longueur) prime, la distance départage les voisins de taille comparable.
      const score = (Math.sqrt(surface) * (industriel(f) ? 2 : 1)) / (1 + d / 100);
      return { ...f, surface, distance: d, score, lettre: '', raison: raison(f, d) };
    })
    .filter((c) => c.distance <= maxDist && c.surface >= 250)
    .sort((a, b) => b.score - a.score)
    .slice(0, LETTRES.length)
    .map((c, i) => ({ ...c, lettre: LETTRES[i] }));
}

const PROPS_BATI = 'geometrie,cleabs,hauteur,nombre_d_etages,usage_1,usage_2,identifiants_rnb,precision_planimetrique,nature,date_modification';

async function buildingsInBox(minLng: number, minLat: number, maxLng: number, maxLat: number, signal?: AbortSignal) {
  const feats = await wfsQuery<WfsFeature['geometry']>(
    'BDTOPO_V3:batiment',
    `PROPERTYNAME=${PROPS_BATI}&BBOX=${minLat},${minLng},${maxLat},${maxLng},urn:ogc:def:crs:EPSG::4326`,
    signal,
    500,
  );
  return feats.map((f) => fromWfs(f as WfsFeature));
}

/** Bâtiments autour d'un point précis : celui qui le contient d'abord, puis les voisins. */
async function aroundPoint(p: LngLat, signal?: AbortSignal): Promise<{ candidates: Candidate[]; auto?: Candidate }> {
  const r = 0.0012;
  const list = await buildingsInBox(p[0] - r * 1.5, p[1] - r, p[0] + r * 1.5, p[1] + r, signal);
  const proj = projector(p);
  const dist = (f: Footprint) => {
    if (pointInPolygon(p, f.contour)) return 0;
    const pts = f.contour.map(proj);
    let d = Infinity;
    for (let i = 0; i < pts.length; i++) d = Math.min(d, distPointSeg([0, 0], pts[i], pts[(i + 1) % pts.length]));
    return d;
  };
  const candidates = rank(list, dist, 150, (_f, d) => (d === 0 ? 'Contient le point' : `À ${Math.round(d)} m du point`));
  const auto = candidates.find((c) => c.distance === 0);
  // Le bâtiment qui contient le point passe en tête, avec la lettre A.
  if (auto && candidates[0] !== auto) {
    const rest = candidates.filter((c) => c !== auto);
    return { candidates: [auto, ...rest].map((c, i) => ({ ...c, lettre: LETTRES[i] })), auto: { ...auto, lettre: 'A' } };
  }
  return { candidates, auto: auto ? { ...auto, lettre: 'A' } : undefined };
}

/**
 * Bâtiments qui bordent une voie BAN : tronçons BD TOPO portant l'identifiant de la voie, cherchés dans un cadre
 * d'environ 1,3 km autour du point de rue (le filtre attributaire du WFS n'est pas indexé : 15 à 25 s ; le cadre : 0,1 s).
 */
async function alongStreet(banStreetId: string, anchor: LngLat, signal?: AbortSignal): Promise<{ candidates: Candidate[]; rue: LngLat[][] }> {
  const R = 0.006;
  const roads = await wfsQuery<{ type: string; coordinates: number[][] | number[][][] }>(
    'BDTOPO_V3:troncon_de_route',
    `PROPERTYNAME=geometrie,identifiant_voie_ban_gauche,identifiant_voie_ban_droite&BBOX=${anchor[1] - R},${anchor[0] - R * 1.5},${anchor[1] + R},${anchor[0] + R * 1.5},urn:ogc:def:crs:EPSG::4326`,
    signal,
    2000,
  );
  const rue: LngLat[][] = roads
    .filter((r) => r.properties.identifiant_voie_ban_gauche === banStreetId || r.properties.identifiant_voie_ban_droite === banStreetId)
    .map((r) => {
      const c = r.geometry.type === 'MultiLineString' ? (r.geometry.coordinates as number[][][]).flat() : (r.geometry.coordinates as number[][]);
      return c.map((q) => [q[0], q[1]] as LngLat);
    });
  if (!rue.length) {
    const near = await aroundPoint(anchor, signal);
    return { candidates: near.candidates, rue: [] };
  }
  const all = rue.flat();
  const pad = 0.0009;
  const minLng = Math.min(...all.map((p) => p[0])) - pad * 1.5;
  const maxLng = Math.max(...all.map((p) => p[0])) + pad * 1.5;
  const minLat = Math.min(...all.map((p) => p[1])) - pad;
  const maxLat = Math.max(...all.map((p) => p[1])) + pad;
  const list = await buildingsInBox(minLng, minLat, maxLng, maxLat, signal);
  const proj = projector([(minLng + maxLng) / 2, (minLat + maxLat) / 2]);
  const segs = rue.flatMap((l) => l.slice(1).map((p, i) => [proj(l[i]), proj(p)] as const));
  const dist = (f: Footprint) => {
    let d = Infinity;
    for (const v of f.contour.map(proj)) for (const [a, b] of segs) d = Math.min(d, distPointSeg(v, a, b));
    return d;
  };
  return { candidates: rank(list, dist, 70, (_f, d) => `À ${Math.round(d)} m de la voie`), rue };
}

export async function localiser(r: SearchResult, signal?: AbortSignal): Promise<Localisation> {
  if (r.precision === 'commune') {
    return {
      anchor: r.coords,
      precision: 'commune',
      libelle: PRECISION_LIBELLE.commune,
      note: 'Une commune entière : précisez la rue ou le nom de l’entreprise, ou zoomez et cliquez sur votre bâtiment.',
      candidates: [],
    };
  }
  if (r.precision === 'gps' || r.precision === 'numero' || r.precision === 'lieu') {
    const { candidates, auto } = await aroundPoint(r.coords, signal);
    return {
      anchor: r.coords,
      precision: r.precision,
      libelle: PRECISION_LIBELLE[r.precision],
      candidates,
      auto,
      note: auto ? undefined : 'Aucun bâtiment exactement sous le point : choisissez parmi les plus proches.',
    };
  }
  if (r.precision === 'rue' && r.banId) {
    const { candidates, rue } = await alongStreet(r.banId, r.coords, signal);
    return {
      anchor: r.coords,
      precision: 'rue',
      libelle: PRECISION_LIBELLE.rue,
      note: `L’adresse désigne toute la rue : ${candidates.length} bâtiments la bordent. Lequel est le vôtre ?`,
      candidates,
      rue,
    };
  }
  if (r.precision === 'entreprise' && r.adresse) {
    // Les coordonnées SIRENE sont parfois approximatives : on repart de l'adresse postale.
    const geo = await geocodeAdresse(r.adresse, signal ?? new AbortController().signal);
    if (geo) {
      const sub = await localiser(geo, signal);
      const proj = projector(geo.coords);
      const ecart = Math.round(Math.hypot(...proj(r.coords)));
      const ecartNote = ecart > 120 ? ` La position SIRENE est à ${ecart} m de l’adresse : elle n’est pas retenue.` : '';
      return { ...sub, note: `${sub.note ?? ''}${ecartNote}`.trim() || undefined, libelle: `${PRECISION_LIBELLE.entreprise} → ${sub.libelle.toLowerCase()}` };
    }
  }
  const { candidates } = await aroundPoint(r.coords, signal);
  return {
    anchor: r.coords,
    precision: r.precision,
    libelle: PRECISION_LIBELLE[r.precision],
    note: 'Position approximative : choisissez votre bâtiment.',
    candidates,
  };
}
