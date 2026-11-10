/**
 * Détection automatique de l'emprise d'un bâtiment.
 *  1. BD TOPO (IGN, France) : géométrie complète par WFS, avec hauteur, nombre d'étages,
 *     usage, identifiant RNB et précision planimétrique.
 *  2. OpenStreetMap (Overpass) : partout ailleurs, ou si l'IGN ne répond pas.
 * Les tuiles vectorielles servent à l'affichage ; leur géométrie est découpée aux bords de tuile,
 * d'où la requête de la géométrie complète au clic.
 */
import { geodesicDistance, geodesicMeasure, openRing, pointInPolygon, type LngLat } from './geodesy';

export interface Footprint {
  source: 'bdtopo' | 'osm';
  sourceRef: string;
  contour: LngLat[];
  hauteur?: number;
  niveaux?: number;
  usage?: string;
  rnb?: string;
  /** Précision planimétrique (m). */
  precision: number;
  nature?: string;
  dateSource?: string;
}

const WFS = 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=BDTOPO_V3:batiment&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326';

export interface WfsFeature {
  id: string;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
  properties: Record<string, unknown>;
}

function outerRings(g: WfsFeature['geometry']): LngLat[][] {
  const polys = g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : [g.coordinates as number[][][]];
  return polys.map((p) => openRing(p[0].map((c) => [c[0], c[1]] as LngLat)));
}

export function fromWfs(f: WfsFeature): Footprint {
  const p = f.properties;
  const rings = outerRings(f.geometry);
  // Le plus grand anneau extérieur (les multipolygones de bâtiments sont rares).
  const contour = rings.sort((a, b) => b.length - a.length)[0];
  return {
    source: 'bdtopo',
    sourceRef: String(p.cleabs ?? f.id),
    contour,
    hauteur: typeof p.hauteur === 'number' ? p.hauteur : undefined,
    niveaux: typeof p.nombre_d_etages === 'number' ? p.nombre_d_etages : undefined,
    usage: [p.usage_1, p.usage_2].filter(Boolean).join(' · ') || undefined,
    rnb: typeof p.identifiants_rnb === 'string' && p.identifiants_rnb ? p.identifiants_rnb.split('/')[0] : undefined,
    precision: typeof p.precision_planimetrique === 'number' ? p.precision_planimetrique : 2.5,
    nature: typeof p.nature === 'string' ? p.nature : undefined,
    dateSource: typeof p.date_modification === 'string' ? p.date_modification : undefined,
  };
}

const WFS_BASE = 'https://data.geopf.fr/wfs/ows?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326';

/** Requête WFS générique sur la BD TOPO (bâtiments, tronçons de route…). */
export async function wfsQuery<G = unknown>(typename: string, filter: string, signal?: AbortSignal, count = 200): Promise<{ id: string; geometry: G; properties: Record<string, unknown> }[]> {
  const res = await fetch(`${WFS_BASE}&TYPENAMES=${typename}&COUNT=${count}&${filter}`, { signal });
  if (!res.ok) throw new Error(`WFS ${res.status}`);
  const data = (await res.json()) as { features?: { id: string; geometry: G; properties: Record<string, unknown> }[] };
  return data.features ?? [];
}

async function wfs(filter: string, signal?: AbortSignal, count = 20): Promise<WfsFeature[]> {
  const res = await fetch(`${WFS}&COUNT=${count}&${filter}`, { signal });
  if (!res.ok) throw new Error(`WFS ${res.status}`);
  const data = (await res.json()) as { features?: WfsFeature[] };
  return data.features ?? [];
}

/**
 * Bâtiment par identifiant, cherché autour du point cliqué : le filtre attributaire `cleabs` du WFS n'est pas indexé
 * (jusqu'à 30 s), les filtres spatiaux répondent en moins de 0,2 s.
 */
export async function bdtopoById(cleabs: string, near: LngLat, signal?: AbortSignal): Promise<Footprint | null> {
  const point = await wfs(`CQL_FILTER=${encodeURIComponent(`INTERSECTS(geometrie,SRID=4326;POINT(${near[0]} ${near[1]}))`)}`, signal, 5);
  const hit = point.find((f) => String(f.properties.cleabs ?? f.id) === cleabs);
  if (hit) return fromWfs(hit);
  const r = 0.0008;
  const around = await wfs(`BBOX=${near[1] - r},${near[0] - r * 1.5},${near[1] + r},${near[0] + r * 1.5},urn:ogc:def:crs:EPSG::4326`, signal, 300);
  const f = around.find((x) => String(x.properties.cleabs ?? x.id) === cleabs);
  return f ? fromWfs(f) : null;
}

/** Bâtiment BD TOPO contenant le point, sinon le plus proche (en privilégiant l'industriel). */
export async function bdtopoAt(p: LngLat, signal?: AbortSignal, radius = 0.0012): Promise<Footprint | null> {
  const inside = await wfs(`CQL_FILTER=${encodeURIComponent(`INTERSECTS(geometrie,SRID=4326;POINT(${p[0]} ${p[1]}))`)}`, signal, 3);
  if (inside[0]) return fromWfs(inside[0]);
  const bbox = `BBOX=${p[1] - radius},${p[0] - radius * 1.5},${p[1] + radius},${p[0] + radius * 1.5},urn:ogc:def:crs:EPSG::4326`;
  const near = (await wfs(bbox, signal, 200)).map(fromWfs);
  return pickNearest(near, p);
}

/**
 * Bâtiment le plus probable autour d'un point d'adresse (souvent posé sur la rue ou au centre de la parcelle) :
 * proche, mais surtout grand et industriel. Les abris et annexes de moins de 60 m² sont écartés s'il y a mieux.
 */
function pickNearest(list: Footprint[], p: LngLat): Footprint | null {
  let best: Footprint | null = null;
  let bestScore = Infinity;
  const sized = list.map((f) => ({ f, area: geodesicMeasure(f.contour).area }));
  const pool = sized.some((x) => x.area >= 60) ? sized.filter((x) => x.area >= 60) : sized;
  for (const { f, area } of pool) {
    let d = Infinity;
    for (const v of f.contour) d = Math.min(d, geodesicDistance(v, p));
    const industriel = /industri|commercial/i.test(`${f.usage ?? ''} ${f.nature ?? ''}`);
    const score = (d + 5) / (1 + Math.log10(Math.max(1, area / 100))) / (industriel ? 2 : 1);
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

export async function osmAt(p: LngLat, signal?: AbortSignal): Promise<Footprint | null> {
  const q = `[out:json][timeout:15];way(around:60,${p[1]},${p[0]})["building"];out tags geom;`;
  for (const url of OVERPASS) {
    try {
      const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: q }), signal });
      if (!res.ok) continue;
      const data = (await res.json()) as { elements: OverpassWay[] };
      const list: Footprint[] = data.elements
        .filter((e) => e.geometry && e.geometry.length > 3)
        .map((e) => ({
          source: 'osm' as const,
          sourceRef: `way/${e.id}`,
          contour: openRing(e.geometry!.map((g) => [g.lon, g.lat] as LngLat)),
          hauteur: e.tags?.height ? parseFloat(e.tags.height) : e.tags?.['building:levels'] ? parseFloat(e.tags['building:levels']) * 4 : undefined,
          niveaux: e.tags?.['building:levels'] ? parseInt(e.tags['building:levels'], 10) : undefined,
          usage: e.tags?.building,
          precision: 2,
        }));
      const inside = list.find((f) => pointInPolygon(p, f.contour));
      return inside ?? pickNearest(list, p);
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  return null;
}

/** Chaîne complète : BD TOPO d'abord (France), puis OSM. */
export async function detectFootprint(p: LngLat, opts: { cleabs?: string; signal?: AbortSignal } = {}): Promise<Footprint | null> {
  try {
    if (opts.cleabs) {
      const f = await bdtopoById(opts.cleabs, p, opts.signal);
      if (f) return f;
    }
    const f = await bdtopoAt(p, opts.signal);
    if (f) return f;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  return osmAt(p, opts.signal);
}

/** Hauteur par défaut si la source n'en donne pas (bâtiment industriel courant). */
export const DEFAULT_HEIGHT = 8;
