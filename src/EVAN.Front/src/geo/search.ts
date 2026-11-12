/**
 * Recherche unifiée : coordonnées GPS ou lien Google Maps collés, adresse (Géoplateforme IGN, autocomplétion),
 * entreprise par nom ou SIREN/SIRET (annuaire des entreprises), repli mondial (Photon / OSM).
 * Chaque résultat porte sa précision : un point d'adresse « rue » ne désigne pas un bâtiment.
 */
import type { LngLat } from './geodesy';

export type Precision = 'gps' | 'numero' | 'rue' | 'commune' | 'entreprise' | 'lieu';

/**
 * Ce que désigne un résultat, dit avec les mêmes mots dans la liste de recherche et dans la carte des bâtiments
 * proposés : un même résultat ne change pas de nom entre les deux.
 */
export const PRECISION_LIBELLE: Record<Precision, string> = {
  gps: 'Point exact',
  numero: 'Numéro de rue',
  rue: 'Rue entière',
  commune: 'Commune',
  entreprise: 'Établissement',
  lieu: 'Lieu OpenStreetMap',
};

export interface SearchResult {
  id: string;
  kind: 'adresse' | 'entreprise' | 'lieu' | 'gps';
  label: string;
  sub?: string;
  coords: LngLat;
  zoom: number;
  precision: Precision;
  /** Identifiant BAN (voie « 37261_0938 » ou adresse « 37261_0938_00012 »). */
  banId?: string;
  siret?: string;
  entreprise?: string;
  /** Adresse postale de l'établissement (re-géocodée, les coordonnées SIRENE étant parfois approximatives). */
  adresse?: string;
}

/**
 * Saisie jouée par la visite guidée dans la barre de recherche (événement `evan:search-type`) : le texte tapé et, pour
 * l'entreprise fictive de la démo, absente de l'annuaire, les résultats à montrer à la place de la recherche réelle.
 */
export interface SaisieVisite {
  q: string;
  resultats?: SearchResult[];
}

/**
 * Aucun service n'a pu répondre (réseau coupé, service en panne ou bloqué par le poste) : ce n'est pas « rien trouvé »,
 * et l'écran ne doit pas faire chercher une faute d'orthographe qui n'existe pas.
 */
export class RechercheIndisponible extends Error {
  constructor() {
    super('Le service de recherche d’adresse ne répond pas.');
    this.name = 'RechercheIndisponible';
  }
}

/** Réponse d'un service, ou `null` s'il n'a pas répondu. Une recherche annulée remonte telle quelle (AbortError). */
async function getJson<T>(url: string, signal: AbortSignal): Promise<T | null> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (e) {
    if (signal.aborted) throw e;
    return null;
  }
}

/** « 47.375835, 0.672815 », « 47,375835 0,672815 », lien Google Maps (…/@47.38,0.67,17z ou !3d…!4d…). */
export function parseCoordinates(q: string): LngLat | null {
  const s = q.trim();
  const at = s.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
  const bang = s.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
  const plain = s.match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  const m = bang ?? at ?? plain;
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // Une seule paire décimale avec virgules (« 49,23, 1,17 ») est ambiguë : on exige des décimales.
  if (!/[.,]\d/.test(m[1]) || !/[.,]\d/.test(m[2])) return null;
  return [lng, lat];
}

interface GeopfFeature {
  geometry: { coordinates: [number, number] };
  properties: { label: string; context?: string; type?: string; id?: string; city?: string; postcode?: string; score?: number };
}

function geopfPrecision(type?: string): Precision {
  return type === 'housenumber' ? 'numero' : type === 'street' ? 'rue' : 'commune';
}

/** Adresses trouvées, ou `null` si le géocodeur n'a pas répondu. */
async function searchAdresse(q: string, signal: AbortSignal, near?: LngLat, limit = 5): Promise<SearchResult[] | null> {
  const bias = near ? `&lat=${near[1]}&lon=${near[0]}` : '';
  const data = await getJson<{ features: GeopfFeature[] }>(
    `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&autocomplete=1&limit=${limit}${bias}`,
    signal,
  );
  if (!data) return null;
  return (data.features ?? []).map((f, i) => {
    const precision = geopfPrecision(f.properties.type);
    return {
      id: `adr-${f.properties.id ?? i}`,
      kind: 'adresse' as const,
      label: f.properties.label,
      sub: f.properties.context,
      coords: f.geometry.coordinates,
      zoom: precision === 'numero' ? 18.5 : precision === 'rue' ? 17 : 14,
      precision,
      banId: f.properties.id,
    };
  });
}

/**
 * Commune d'une adresse postale (« 48 Rue Paul Sabatier 71530 Crissey », « ZI DU MENNETON AVENUE THERESE VOISIN 37000 TOURS CEDEX ») :
 * de quoi nommer une usine quand l'organisation en compte plusieurs.
 */
export function communeDe(adresse: string | undefined): string | undefined {
  const brut = adresse?.match(/\b\d{5}\s+([^,\d]+?)(?:\s+CEDEX(?:\s*\d+)?)?\s*(?:,|$)/i)?.[1]?.trim();
  if (!brut) return undefined;
  // Les adresses SIRENE sont en capitales : « SAINT PIERRE DES CORPS » → « Saint Pierre des Corps ».
  const petits = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'sur', 'sous', 'en', 'lez', 'lès', 'et', 'aux', 'au']);
  return brut
    .toLowerCase()
    .split(/(\s+|-|')/)
    .map((w, i) => (i > 0 && petits.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

/**
 * Variantes d'une adresse SIRENE, de la plus fidèle à la plus dépouillée : les mentions de zone (« ZI », « ZAC »,
 * « Parc d'activités »…), de boîte postale ou de cedex font échouer le géocodeur BAN.
 */
export function variantesAdresse(adresse: string): string[] {
  const zone =
    /\b(Z\.?\s?I\.?|Z\.?\s?A\.?\s?C?\.?|Z\.?\s?A\.?\s?E\.?|ZONE\s+(INDUSTRIELLE|ARTISANALE|D'?\s?ACTIVITES?|COMMERCIALE)|PARC\s+D'?\s?ACTIVITES?|LIEU[-\s]DIT|LD)\b\.?/gi;
  const postal = /\b(BP|CS|TSA)\s*\d+\b|\bCEDEX(\s*\d+)?\b/gi;
  const propre = (s: string) => s.replace(/\s{2,}/g, ' ').replace(/^[\s,-]+|[\s,-]+$/g, '').trim();
  const sansPostal = propre(adresse.replace(postal, ' '));
  const sansZone = propre(sansPostal.replace(zone, ' '));
  // Dernier recours : la partie à partir du type de voie.
  const voie = sansZone.match(/\b(\d+\s*(BIS|TER)?\s+)?(RUE|AVENUE|AV|BOULEVARD|BD|CHEMIN|ROUTE|IMPASSE|ALLEE|PLACE|QUAI|VOIE|COURS|ZONE)\b.*$/i)?.[0];
  return [...new Set([adresse.trim(), sansPostal, sansZone, voie ? propre(voie) : ''])].filter((v) => v.length > 4);
}

/** Géocode une adresse postale complète (pour vérifier une position SIRENE), en essayant ses variantes. */
export async function geocodeAdresse(adresse: string, signal: AbortSignal): Promise<SearchResult | null> {
  const cp = adresse.match(/\b\d{5}\b/)?.[0];
  for (const v of variantesAdresse(adresse)) {
    const r = ((await searchAdresse(v, signal, undefined, 3)) ?? []).filter((x) => x.precision !== 'commune' && (!cp || !x.sub || x.sub.startsWith(cp.slice(0, 2))));
    if (r.length) return r[0];
    if (signal.aborted) return null;
  }
  return null;
}

interface Etab {
  siret: string;
  latitude?: string | number;
  longitude?: string | number;
  adresse?: string;
  est_siege?: boolean;
  etat_administratif?: string;
  libelle_commune?: string;
}

interface EntrepriseResult {
  siren: string;
  nom_complet: string;
  activite_principale?: string;
  tranche_effectif_salarie?: string;
  siege: Etab;
  matching_etablissements?: Etab[];
}

/** Établissements trouvés, ou `null` si l'annuaire n'a pas répondu. */
async function searchEntreprise(q: string, signal: AbortSignal): Promise<SearchResult[] | null> {
  if (q.trim().length < 3) return [];
  const data = await getJson<{ results: EntrepriseResult[] }>(
    `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=4&etat_administratif=A`,
    signal,
  );
  if (!data) return null;
  const out: SearchResult[] = [];
  for (const r of data.results ?? []) {
    const etabs = [r.siege, ...(r.matching_etablissements ?? []).filter((e) => e.siret !== r.siege.siret)].filter(
      (e) => e.latitude && e.longitude && e.etat_administratif !== 'F',
    );
    for (const e of etabs.slice(0, 3)) {
      out.push({
        id: `ent-${e.siret}`,
        kind: 'entreprise',
        label: r.nom_complet,
        sub: `${e.est_siege || e.siret === r.siege.siret ? 'Siège · ' : ''}${e.adresse ?? e.libelle_commune ?? ''}${r.activite_principale ? ` · NAF ${r.activite_principale}` : ''}`,
        coords: [Number(e.longitude), Number(e.latitude)],
        zoom: 17,
        precision: 'entreprise',
        siret: e.siret,
        entreprise: r.nom_complet,
        adresse: e.adresse,
      });
    }
  }
  return out.slice(0, 5);
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: { name?: string; street?: string; housenumber?: string; city?: string; country?: string; osm_id?: number; type?: string };
}

/** Lieux trouvés dans le monde, ou `null` si Photon n'a pas répondu. */
async function searchMonde(q: string, signal: AbortSignal): Promise<SearchResult[] | null> {
  const data = await getJson<{ features: PhotonFeature[] }>(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=4&lang=fr`, signal);
  if (!data) return null;
  return (data.features ?? []).map((f, i) => {
    const p = f.properties;
    const label = [p.name, [p.housenumber, p.street].filter(Boolean).join(' ')].filter(Boolean).join(', ') || q;
    return {
      id: `osm-${p.osm_id ?? i}`,
      kind: 'lieu' as const,
      label,
      sub: [p.city, p.country].filter(Boolean).join(', '),
      coords: f.geometry.coordinates,
      zoom: p.type === 'house' ? 18 : 15,
      precision: 'lieu' as const,
    };
  });
}

/**
 * Lance les recherches en parallèle ; le repli mondial n'est utilisé que si la France ne répond rien. Sans aucun
 * résultat alors qu'un service n'a pas répondu, la recherche échoue (`RechercheIndisponible`) au lieu de dire « rien
 * trouvé » : l'adresse existe peut-être, c'est le service qui manque.
 */
export async function search(q: string, signal: AbortSignal, near?: LngLat): Promise<SearchResult[]> {
  const query = q.trim();
  const gps = parseCoordinates(query);
  if (gps) {
    return [
      {
        id: `gps-${gps.join(',')}`,
        kind: 'gps',
        label: `${gps[1].toFixed(6)}, ${gps[0].toFixed(6)}`,
        sub: 'Coordonnées GPS : le bâtiment sous ce point sera relevé',
        coords: gps,
        zoom: 18.5,
        precision: 'gps',
      },
    ];
  }
  if (query.length < 3) return [];
  const isSiret = /^\d[\d\s]{8,}$/.test(query);
  const [adr, ent] = await Promise.all([
    isSiret ? Promise.resolve([]) : searchAdresse(query, signal, near),
    searchEntreprise(query.replace(/\s/g, isSiret ? '' : ' '), signal),
  ]);
  // Une entreprise trouvée par son nom passe devant les rues homonymes.
  const results = /\d/.test(query) ? [...(adr ?? []), ...(ent ?? [])] : [...(ent ?? []), ...(adr ?? [])];
  if (results.length) return results.slice(0, 8);
  const monde = await searchMonde(query, signal);
  if (monde?.length) return monde;
  if (adr === null || ent === null || monde === null) throw new RechercheIndisponible();
  return [];
}
