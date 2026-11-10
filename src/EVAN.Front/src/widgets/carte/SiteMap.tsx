/**
 * Étape 1 : carte satellite et relevé d'emprise.
 *
 * Rendu en fonction du zoom :
 *  - z < 14 : imagerie seule ;
 *  - z 14-15 : contours OSM discrets (monde) ;
 *  - z ≥ 15 : bâtiments BD TOPO (France), bâtiments industriels en ambre, survol = surface et hauteur ;
 *  - bâtiment retenu : trait braise de la charte (--map-line), halo dont l'épaisseur est l'incertitude réelle en
 *    mètres (il s'élargit en pixels quand on zoome), sommets éditables à partir de z 16, cotes des côtés à partir
 *    de z 17,5.
 *
 * Pourquoi la braise et plus le cyan : sur l'orthophoto, les toits sont gris, la végétation verte et les parkings
 * gris-bleu ; un orange vif tranche sur les trois, et c'est la couleur de la marque. L'ambre reste aux bâtiments
 * proposés et aux bâtiments industriels de l'IGN, plus pâles et en trait fin ou pointillé.
 */
import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification, GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useProject } from '@/store/project';
import { useUi, isReducedMotion } from '@/store/ui';
import type { Batiment } from '@/domain/types';
import { BDTOPO_VECTOR, ESRI_WORLD, IGN_ORTHO, OPENFREEMAP, inFrance } from '@/geo/tiles';
import { computeFrame, fromLocal, geodesicMeasure, labelPoint, metersPerPixel, toLocal, formatArea, formatLength, type LngLat } from '@/geo/geodesy';
import { detectFootprint, DEFAULT_HEIGHT, type Footprint } from '@/geo/footprint';
import type { Localisation } from '@/geo/candidates';
import { uid } from '@/sim/random';
import { edgesToGeoJSON, handSigma, measureBuilding, ringToGeoJSON, snapVertex } from './measure';
import { mapHandle, useMapUi } from './mapState';
import { fitSite } from './cadrage';
import { candidateAnchor, chooseCandidate } from './localisation';
import './carte.css';

/**
 * Échappe une valeur avant de l'insérer dans du HTML de la carte (infobulles, étiquettes) : nom de bâtiment saisi par
 * l'utilisateur, propriétés des tuiles de l'IGN. Sans cela, un nom contenant du HTML s'exécuterait dans la page.
 */
function esc(v: unknown): string {
  return String(v).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// MapLibre 6 charge son worker à côté du module ; on lui donne l'URL servie par Vite (dev et build).
maplibregl.setWorkerUrl(maplibreWorkerUrl);

const AMBRE = '#ffc95c';
const BRAISE = '#ff7a3d';

/**
 * Couleur du bâtiment retenu, lue dans les jetons de la charte (--map-line) pour suivre le thème. La carte dessine
 * en WebGL : elle a besoin de la valeur, pas de la variable.
 */
function couleurTrait(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--map-line').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : BRAISE;
}

/** La même couleur avec une transparence, pour le dégradé du tracé animé. */
function avecAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Cartes dont le style est chargé (isStyleLoaded() repasse à faux pendant le chargement des tuiles). */
const readyMaps = new WeakSet<maplibregl.Map>();
const isReady = (map: maplibregl.Map | null | undefined): map is maplibregl.Map => !!map && readyMaps.has(map);
const FRANCE_BOUNDS: [number, number, number, number] = [-5.5, 41.2, 9.8, 51.2];
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const usageColor: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 'usage_1'],
  'Industriel',
  '#ffb547',
  'Commercial et services',
  '#ffd59a',
  'Agricole',
  '#cde8a2',
  '#ffffff',
];

function buildStyle(trait: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [ESRI_WORLD],
        tileSize: 256,
        maxzoom: 19,
        attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
      },
      ign: {
        type: 'raster',
        tiles: [IGN_ORTHO],
        tileSize: 256,
        // Sous le zoom 9, l'imagerie mondiale seule : pas de raccord visible au bord de la couverture IGN.
        minzoom: 9,
        maxzoom: 19,
        bounds: FRANCE_BOUNDS,
        attribution: '© IGN · BD ORTHO® · BD TOPO®',
      },
      bdtopo: {
        type: 'vector',
        tiles: [BDTOPO_VECTOR],
        minzoom: 15,
        maxzoom: 19,
        bounds: FRANCE_BOUNDS,
        promoteId: { batiment: 'cleabs' },
      },
      ofm: { type: 'vector', url: OPENFREEMAP, attribution: '© OpenStreetMap · OpenFreeMap' },
      sel: { type: 'geojson', data: EMPTY },
      edges: { type: 'geojson', data: EMPTY },
      trace: { type: 'geojson', data: EMPTY, lineMetrics: true },
      draw: { type: 'geojson', data: EMPTY },
      rue: { type: 'geojson', data: EMPTY },
      cand: { type: 'geojson', data: EMPTY, promoteId: 'ref' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#060a14' } },
      { id: 'sat-esri', type: 'raster', source: 'esri', paint: { 'raster-fade-duration': 250 } },
      { id: 'sat-ign', type: 'raster', source: 'ign', paint: { 'raster-fade-duration': 250 } },
      {
        id: 'ofm-fill',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': '#ffffff', 'fill-opacity': 0.01 },
      },
      {
        id: 'ofm-line',
        type: 'line',
        source: 'ofm',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'line-color': '#ffffff',
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.2, 17, 0.55],
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 0.3, 17, 1, 20, 2],
        },
      },
      {
        id: 'bdtopo-fill',
        type: 'fill',
        source: 'bdtopo',
        'source-layer': 'batiment',
        paint: {
          'fill-color': usageColor,
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            ['case', ['boolean', ['feature-state', 'hover'], false], 0.38, 0.03],
            18,
            ['case', ['boolean', ['feature-state', 'hover'], false], 0.38, 0.1],
          ],
        },
      },
      {
        id: 'bdtopo-line',
        type: 'line',
        source: 'bdtopo',
        'source-layer': 'batiment',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': usageColor,
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 17, 0.8, 19, 0.95],
          // Trait affiné à faible zoom, épaissi en approche ; plus marqué au survol.
          'line-width': [
            'interpolate',
            ['exponential', 1.6],
            ['zoom'],
            15,
            ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0.35],
            17,
            ['case', ['boolean', ['feature-state', 'hover'], false], 2.4, 0.9],
            19,
            ['case', ['boolean', ['feature-state', 'hover'], false], 3.4, 1.7],
            21,
            ['case', ['boolean', ['feature-state', 'hover'], false], 4.4, 2.4],
          ],
        },
      },
      {
        id: 'bdtopo-3d',
        type: 'fill-extrusion',
        source: 'bdtopo',
        'source-layer': 'batiment',
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': usageColor,
          'fill-extrusion-height': ['coalesce', ['get', 'hauteur'], 6],
          'fill-extrusion-opacity': 0.62,
        },
      },
      {
        id: 'rue-line',
        type: 'line',
        source: 'rue',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': AMBRE,
          'line-opacity': 0.45,
          'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 14, 3, 17, 9, 19, 22],
          'line-blur': 2,
        },
      },
      {
        id: 'cand-fill',
        type: 'fill',
        source: 'cand',
        filter: ['!', ['get', 'retenu']],
        paint: { 'fill-color': AMBRE, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.36, 0.12] },
      },
      {
        id: 'cand-line',
        type: 'line',
        source: 'cand',
        filter: ['!', ['get', 'retenu']],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': AMBRE,
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3.2, 2],
          'line-dasharray': [2.2, 1.4],
        },
      },
      {
        id: 'sel-fill',
        type: 'fill',
        source: 'sel',
        // Voile léger : le toit reste lisible sous la couleur.
        paint: { 'fill-color': trait, 'fill-opacity': ['case', ['get', 'active'], 0.09, 0.05] },
      },
      {
        id: 'sel-halo',
        type: 'line',
        source: 'edges',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': trait, 'line-opacity': 0.26, 'line-width': 4, 'line-blur': 1 },
      },
      {
        id: 'sel-line',
        type: 'line',
        source: 'sel',
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': trait,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 2, 17, 2.6, 20, 3.6],
          'line-opacity': ['case', ['get', 'active'], 1, 0.7],
        },
      },
      {
        id: 'trace-line',
        type: 'line',
        source: 'trace',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 3, 20, 5], 'line-gradient': ['interpolate', ['linear'], ['line-progress'], 0, trait, 1, trait] },
      },
      {
        id: 'sel-3d',
        type: 'fill-extrusion',
        source: 'sel',
        layout: { visibility: 'none' },
        paint: { 'fill-extrusion-color': trait, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.55 },
      },
      {
        id: 'draw-line',
        type: 'line',
        source: 'draw',
        // Contour dessiné à la main : la couleur du bâtiment retenu, en pointillé tant qu'il n'est pas fermé.
        paint: { 'line-color': trait, 'line-width': 2.5, 'line-dasharray': [2, 1.2] },
      },
    ],
  };
}

function selCollection(batiments: Batiment[], activeId?: string, override?: { id: string; ring: LngLat[] }): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: batiments.map((b) => ({
      type: 'Feature',
      properties: { id: b.id, active: b.id === activeId, h: b.hauteur },
      geometry: ringToGeoJSON(override?.id === b.id ? override.ring : b.contour),
    })),
  };
}

function candCollection(loc: Localisation | undefined, batiments: Batiment[]): GeoJSON.FeatureCollection {
  if (!loc) return EMPTY;
  const retenus = new Set(batiments.map((b) => b.sourceRef));
  return {
    type: 'FeatureCollection',
    features: loc.candidates.map((c) => ({
      type: 'Feature',
      properties: { ref: c.sourceRef, lettre: c.lettre, retenu: retenus.has(c.sourceRef) },
      geometry: ringToGeoJSON(c.contour),
    })),
  };
}

/** Largeur du halo d'incertitude : 2σ en mètres convertis en pixels selon le zoom. */
function haloWidth(lat: number): maplibregl.ExpressionSpecification {
  const k = (z: number) => 2 / metersPerPixel(lat, z);
  return ['interpolate', ['exponential', 2], ['zoom'], 12, ['max', 2, ['*', ['get', 's'], k(12)]], 22, ['*', ['get', 's'], k(22)]];
}

export function SiteMap({ visible }: { visible: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const labels = useRef<maplibregl.Marker[]>([]);
  const drag = useRef<{ id: string; ring: LngLat[]; sigmas: number[]; index: number } | null>(null);
  const batiments = useProject((s) => s.batiments);
  const selectedId = useUi((s) => s.selectedBatimentId);
  const mode = useMapUi((s) => s.mode);
  const zoom = useMapUi((s) => s.zoom);
  const pitch3d = useMapUi((s) => s.pitch3d);
  const drawPoints = useMapUi((s) => s.drawPoints);
  const lastAddedId = useMapUi((s) => s.lastAddedId);
  const localisation = useMapUi((s) => s.localisation);
  const hoverCandidate = useMapUi((s) => s.hoverCandidate);
  const theme = useUi((s) => s.theme);
  const zoomBucket = zoom >= 17.5 ? 3 : zoom >= 16 ? 2 : zoom >= 15.5 ? 1 : 0;

  // Création unique de la carte.
  useEffect(() => {
    if (!el.current) return;
    const { site: s, batiments: bs } = useProject.getState();
    const map = new maplibregl.Map({
      container: el.current,
      style: buildStyle(couleurTrait()),
      center: s?.coordonnees ?? [2.4, 46.6],
      zoom: s ? 16.5 : 5,
      maxZoom: 21.5,
      maxPitch: 70,
      attributionControl: { compact: true },
      dragRotate: true,
    });
    mapHandle.map = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 140 }), 'bottom-left');

    // Tuiles manquantes (orthophoto IGN au zoom 19 hors couverture…) : l'imagerie Esri dessous prend le relais.
    map.on('error', (e) => {
      const err = e.error as { status?: number; url?: string } | undefined;
      if (err?.status && err.status >= 400 && err.status < 500) return;
      console.warn('Carte :', e.error?.message ?? e);
    });

    const hoverPopup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '260px' });
    let hoverId: string | number | undefined;
    let raf = 0;

    const updateZoom = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const z = map.getZoom();
        useMapUi.getState().set({ zoom: z, mpp: metersPerPixel(map.getCenter().lat, z) });
        if (!isReady(map)) return;
        const fr = inFrance([map.getCenter().lng, map.getCenter().lat]);
        // En France, la BD TOPO (plus précise, avec hauteurs) remplace les contours OSM.
        map.setLayoutProperty('ofm-line', 'visibility', fr && z >= 15 ? 'none' : 'visible');
        map.setLayoutProperty('ofm-fill', 'visibility', fr && z >= 15 ? 'none' : 'visible');
      });
    };
    map.on('move', updateZoom);
    map.on('load', () => {
      readyMaps.add(map);
      updateZoom();
      syncSources();
      if (bs.length) fitSite(map, bs, { duration: 0 });
    });

    map.on('mousemove', 'bdtopo-fill', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      if (hoverId !== undefined && hoverId !== f.id) map.setFeatureState({ source: 'bdtopo', sourceLayer: 'batiment', id: hoverId }, { hover: false });
      hoverId = f.id;
      if (hoverId !== undefined) map.setFeatureState({ source: 'bdtopo', sourceLayer: 'batiment', id: hoverId }, { hover: true });
      map.getCanvas().style.cursor = 'pointer';
      if (useMapUi.getState().mode !== 'browse') return;
      const p = f.properties as Record<string, unknown>;
      const geom = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
      const ring = (geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0]) as LngLat[];
      const approx = geodesicMeasure(ring).area;
      hoverPopup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="map-tip"><b>${esc(p.usage_1 ?? 'Bâtiment')}</b><br>≈ ${formatArea(approx)} au sol${p.hauteur ? ` · ${esc(String(p.hauteur).replace('.', ','))} m de haut` : ''}<br><span class="faint">Cliquez pour l’ajouter à l’usine</span></div>`,
        )
        .addTo(map);
    });
    map.on('mouseleave', 'bdtopo-fill', () => {
      if (hoverId !== undefined) map.setFeatureState({ source: 'bdtopo', sourceLayer: 'batiment', id: hoverId }, { hover: false });
      hoverId = undefined;
      map.getCanvas().style.cursor = '';
      hoverPopup.remove();
    });

    map.on('mousemove', 'cand-fill', (e) => {
      const ref = e.features?.[0]?.properties?.ref as string | undefined;
      if (ref && useMapUi.getState().hoverCandidate !== ref) useMapUi.getState().set({ hoverCandidate: ref });
    });
    map.on('mouseleave', 'cand-fill', () => useMapUi.getState().set({ hoverCandidate: undefined }));

    map.on('click', (e: MapMouseEvent) => {
      const ui = useMapUi.getState();
      if (ui.mode === 'draw') {
        ui.set({ drawPoints: [...ui.drawPoints, [e.lngLat.lng, e.lngLat.lat]] });
        return;
      }
      const sel = map.queryRenderedFeatures(e.point, { layers: ['sel-fill'] })[0];
      if (sel) {
        useUi.getState().selectBatiment(String(sel.properties?.id));
        return;
      }
      const cand = map.queryRenderedFeatures(e.point, { layers: ['cand-fill'] })[0];
      const c = cand && ui.localisation?.candidates.find((x) => x.sourceRef === cand.properties?.ref);
      if (c) {
        void chooseCandidate(c);
        return;
      }
      const f = map.queryRenderedFeatures(e.point, { layers: ['bdtopo-fill', 'ofm-fill'] })[0];
      if (!f) return;
      const cleabs = f.layer.id === 'bdtopo-fill' ? String(f.id ?? f.properties?.cleabs ?? '') : undefined;
      void addBuildingAt([e.lngLat.lng, e.lngLat.lat], cleabs || undefined);
    });

    map.on('dblclick', (e) => {
      const ui = useMapUi.getState();
      if (ui.mode === 'draw' && ui.drawPoints.length >= 3) {
        e.preventDefault();
        finishDrawing();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      mapHandle.map = null;
      map.remove();
    };
  }, []);

  // Sources « sélection » et « côtés » à jour.
  function syncSources(override?: { id: string; ring: LngLat[]; sigmas: number[] }) {
    const map = mapHandle.map;
    if (!isReady(map)) return;
    const { batiments: bs } = useProject.getState();
    const active = useUi.getState().selectedBatimentId ?? bs[0]?.id;
    (map.getSource('sel') as GeoJSONSource | undefined)?.setData(selCollection(bs, active, override));
    const target = override ?? bs.find((b) => b.id === active);
    if (target) {
      const ring = 'ring' in target ? target.ring : target.contour;
      (map.getSource('edges') as GeoJSONSource | undefined)?.setData(edgesToGeoJSON(ring, target.sigmas));
      map.setPaintProperty('sel-halo', 'line-width', haloWidth(ring[0][1]));
    } else {
      (map.getSource('edges') as GeoJSONSource | undefined)?.setData(EMPTY);
    }
  }

  useEffect(() => {
    syncSources();
  }, [batiments, selectedId]);

  useEffect(() => {
    if (visible) mapHandle.map?.resize();
  }, [visible]);

  // Changement de thème : le trait du bâtiment reprend la couleur des jetons (la carte ne lit pas les variables CSS).
  useEffect(() => {
    const map = mapHandle.map;
    if (!isReady(map)) return;
    const c = couleurTrait();
    map.setPaintProperty('sel-fill', 'fill-color', c);
    map.setPaintProperty('sel-halo', 'line-color', c);
    map.setPaintProperty('sel-line', 'line-color', c);
    map.setPaintProperty('sel-3d', 'fill-extrusion-color', c);
    map.setPaintProperty('draw-line', 'line-color', c);
  }, [theme]);

  // Bâtiments proposés pour l'adresse : contours ambre pointillés, pastilles lettrées, rue et point d'adresse.
  useEffect(() => {
    const map = mapHandle.map;
    if (!map) return;
    const pins: maplibregl.Marker[] = [];
    const apply = () => {
      (map.getSource('cand') as GeoJSONSource | undefined)?.setData(candCollection(localisation, batiments));
      (map.getSource('rue') as GeoJSONSource | undefined)?.setData(
        localisation?.rue?.length ? { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: localisation.rue } } : EMPTY,
      );
      if (!localisation || !visible) return;
      const retenus = new Set(batiments.map((b) => b.sourceRef));
      const addr = document.createElement('div');
      addr.className = 'addr-pin';
      addr.innerHTML = `<i></i><span>${localisation.precision === 'gps' ? 'Point GPS' : localisation.precision === 'rue' || localisation.libelle.includes('rue') ? 'Adresse (rue)' : 'Adresse'}</span>`;
      pins.push(new maplibregl.Marker({ element: addr, anchor: 'bottom' }).setLngLat(localisation.anchor).addTo(map));
      for (const c of localisation.candidates) {
        // Un bâtiment retenu porte déjà l'étiquette de surface : pas de pastille par-dessus.
        if (retenus.has(c.sourceRef)) continue;
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'cand-pin';
        el.dataset.ref = c.sourceRef;
        el.setAttribute('aria-label', `Bâtiment ${c.lettre}, ${formatArea(c.surface)} : le retenir`);
        el.innerHTML = `<b>${esc(c.lettre)}</b><span>${formatArea(c.surface)}</span>`;
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          void chooseCandidate(c);
        });
        el.addEventListener('mouseenter', () => useMapUi.getState().set({ hoverCandidate: c.sourceRef }));
        el.addEventListener('mouseleave', () => useMapUi.getState().set({ hoverCandidate: undefined }));
        pins.push(new maplibregl.Marker({ element: el }).setLngLat(candidateAnchor(c)).addTo(map));
      }
    };
    if (readyMaps.has(map)) apply();
    else map.once('load', apply);
    return () => pins.forEach((m) => m.remove());
  }, [localisation, batiments, visible]);

  // Survol d'un candidat (carte ou liste) : surlignage partagé.
  useEffect(() => {
    const map = mapHandle.map;
    if (!isReady(map) || !localisation) return;
    for (const c of localisation.candidates) map.setFeatureState({ source: 'cand', id: c.sourceRef }, { hover: c.sourceRef === hoverCandidate });
    document.querySelectorAll<HTMLElement>('.cand-pin').forEach((el) => el.classList.toggle('hover', el.dataset.ref === hoverCandidate));
  }, [hoverCandidate, localisation]);

  // Relief 3D.
  useEffect(() => {
    const map = mapHandle.map;
    if (!map) return;
    const apply = () => {
      map.setLayoutProperty('bdtopo-3d', 'visibility', pitch3d ? 'visible' : 'none');
      map.setLayoutProperty('sel-3d', 'visibility', pitch3d ? 'visible' : 'none');
      map.easeTo({ pitch: pitch3d ? 58 : 0, duration: isReducedMotion() ? 0 : 900 });
    };
    if (readyMaps.has(map)) apply();
    else map.once('load', apply);
  }, [pitch3d]);

  // Tracé animé du contour détecté.
  useEffect(() => {
    const map = mapHandle.map;
    const b = useProject.getState().batiments.find((x) => x.id === lastAddedId);
    if (!isReady(map) || !b) return;
    const src = map.getSource('trace') as GeoJSONSource | undefined;
    src?.setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...b.contour, b.contour[0]] } });
    const dur = isReducedMotion() ? 1 : 1300;
    const t0 = performance.now();
    const trait = couleurTrait();
    const vide = avecAlpha(trait, 0);
    let raf = 0;
    const frame = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      // Arrêts strictement croissants : traînée braise, tête blanche, reste transparent.
      const p = Math.min(0.9998, Math.max(0.002, k));
      const tail = Math.max(0.001, p - 0.08);
      map.setPaintProperty('trace-line', 'line-gradient', [
        'interpolate',
        ['linear'],
        ['line-progress'],
        0,
        avecAlpha(trait, 0.25),
        tail,
        trait,
        p,
        '#ffffff',
        p + 0.0001,
        k >= 1 ? trait : vide,
        1,
        k >= 1 ? trait : vide,
      ]);
      if (k < 1) raf = requestAnimationFrame(frame);
      else window.setTimeout(() => src?.setData(EMPTY), 300);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [lastAddedId]);

  // Dessin manuel.
  useEffect(() => {
    const map = mapHandle.map;
    if (!isReady(map)) return;
    const src = map.getSource('draw') as GeoJSONSource | undefined;
    src?.setData(
      drawPoints.length > 1
        ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: drawPoints } }
        : EMPTY,
    );
  }, [drawPoints]);

  // Poignées d'édition, cotes et étiquette de surface.
  useEffect(() => {
    const map = mapHandle.map;
    if (!map) return;
    markers.current.forEach((m) => m.remove());
    labels.current.forEach((m) => m.remove());
    markers.current = [];
    labels.current = [];
    const b = batiments.find((x) => x.id === (selectedId ?? batiments[0]?.id));
    if (!b || !visible) return;

    // Étiquettes : surface (z ≥ 15,5) et longueur des côtés (z ≥ 17,5).
    const areaEl = document.createElement('div');
    areaEl.className = 'area-label';
    // Juste après la détection, l'étiquette attend la fin du tracé du contour pour apparaître : on voit le bâtiment
    // se dessiner, puis sa surface. Les autres fois (zoom, sélection), elle est là tout de suite.
    const { lastAddedId: neuf, lastAddedAt } = useMapUi.getState();
    if (neuf === b.id && lastAddedAt !== undefined && performance.now() - lastAddedAt < 1500) areaEl.classList.add('neuf');
    const edgeEls: HTMLDivElement[] = [];
    const updateLabels = (ring: LngLat[], sigmas: number[]) => {
      const m = measureBuilding({ contour: ring, sigmas, hauteur: b.hauteur, niveaux: b.niveaux });
      // La surface et le nom du bâtiment ; l'écart de précision reste dans le panneau (infobulle), pas sur la photo.
      areaEl.innerHTML = `${formatArea(m.area)}<small>${esc(b.nom)}</small>`;
      const frame = computeFrame(ring);
      const c = fromLocal(frame, labelPoint(ring.map((p) => toLocal(frame, p))));
      labels.current[0]?.setLngLat(c);
      m.edges.forEach((len, i) => {
        const a = ring[i];
        const z = ring[(i + 1) % ring.length];
        const el = edgeEls[i];
        if (!el) return;
        el.textContent = formatLength(len);
        labels.current[i + 1]?.setLngLat([(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]);
        el.style.display = len < 5 ? 'none' : '';
      });
    };
    if (zoomBucket >= 1) {
      labels.current.push(new maplibregl.Marker({ element: areaEl }).setLngLat(b.contour[0]).addTo(map));
    }
    if (zoomBucket >= 3) {
      // En édition, la poignée « ajouter un coin » occupe le milieu du côté : la cote se pousse au-dessus.
      const decalage: [number, number] = mode === 'edit' && zoomBucket >= 2 ? [0, -20] : [0, 0];
      b.contour.forEach((p) => {
        const e = document.createElement('div');
        e.className = 'edge-label';
        edgeEls.push(e);
        labels.current.push(new maplibregl.Marker({ element: e, offset: decalage }).setLngLat(p).addTo(map));
      });
    }
    if (zoomBucket >= 1) updateLabels(b.contour, b.sigmas);

    if (mode !== 'edit' || zoomBucket < 2) return;
    const frame = computeFrame(b.contour);
    const commit = () => {
      const d = drag.current;
      if (!d) return;
      useProject.getState().setContour(d.id, d.ring, d.sigmas);
      drag.current = null;
      useMapUi.getState().set({ editing: undefined });
    };
    const moveTo = (ll: maplibregl.LngLat) => {
      const d = drag.current;
      if (!d) return;
      const local = d.ring.map((p) => toLocal(frame, p));
      const snapped = snapVertex(local, d.index, toLocal(frame, [ll.lng, ll.lat]));
      const p = fromLocal(frame, snapped);
      d.ring[d.index] = p;
      d.sigmas[d.index] = handSigma(useMapUi.getState().mpp);
      syncSources({ id: d.id, ring: d.ring, sigmas: d.sigmas });
      updateLabels(d.ring, d.sigmas);
      useMapUi.getState().set({ editing: { id: d.id, ring: [...d.ring], sigmas: [...d.sigmas] } });
      return p;
    };

    b.contour.forEach((p, i) => {
      const e = document.createElement('div');
      e.className = 'vx';
      e.title = 'Glisser ce coin sur le bord du toit. Double-clic : le supprimer.';
      e.setAttribute('aria-label', `Coin ${i + 1} du contour`);
      const mk = new maplibregl.Marker({ element: e, draggable: true }).setLngLat(p).addTo(map);
      mk.on('dragstart', () => {
        useProject.getState().pushHistory();
        drag.current = { id: b.id, ring: [...b.contour], sigmas: [...b.sigmas], index: i };
      });
      mk.on('drag', () => {
        const q = moveTo(mk.getLngLat());
        if (q) mk.setLngLat(q);
      });
      mk.on('dragend', commit);
      e.addEventListener('dblclick', (ev) => {
        ev.stopPropagation();
        if (b.contour.length <= 3) return;
        useProject.getState().pushHistory();
        useProject.getState().setContour(
          b.id,
          b.contour.filter((_, j) => j !== i),
          b.sigmas.filter((_, j) => j !== i),
        );
      });
      markers.current.push(mk);
    });
    // Milieux de côtés : glisser insère un sommet.
    b.contour.forEach((p, i) => {
      const q = b.contour[(i + 1) % b.contour.length];
      const e = document.createElement('div');
      e.className = 'vx mid';
      e.title = 'Glisser pour ajouter un coin ici';
      const mid: LngLat = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const mk = new maplibregl.Marker({ element: e, draggable: true }).setLngLat(mid).addTo(map);
      mk.on('dragstart', () => {
        useProject.getState().pushHistory();
        const ring = [...b.contour];
        const sigmas = [...b.sigmas];
        ring.splice(i + 1, 0, mid);
        sigmas.splice(i + 1, 0, handSigma(useMapUi.getState().mpp));
        drag.current = { id: b.id, ring, sigmas, index: i + 1 };
      });
      mk.on('drag', () => {
        const r = moveTo(mk.getLngLat());
        if (r) mk.setLngLat(r);
      });
      mk.on('dragend', commit);
      markers.current.push(mk);
    });
  }, [batiments, selectedId, mode, zoomBucket, visible]);

  return <div ref={el} className="carte-satellite" data-guide="carte" style={{ position: 'absolute', inset: 0 }} aria-label="Carte satellite du site" role="application" />;
}

/** Détection et ajout d'un bâtiment au site (clic sur la carte ou point d'adresse). */
export async function addBuildingAt(p: LngLat, cleabs?: string) {
  const ui = useMapUi.getState();
  const project = useProject.getState();
  const existing = project.batiments.find((b) => cleabs && b.sourceRef === cleabs);
  if (existing) {
    useUi.getState().selectBatiment(existing.id);
    return existing;
  }
  ui.set({ detecting: true, detectError: undefined });
  try {
    const fp = await detectFootprint(p, { cleabs });
    if (!fp) {
      ui.set({
        detecting: false,
        detectError: 'Aucun bâtiment connu à cet endroit. Cliquez au milieu du toit, ou dessinez son contour à la main.',
      });
      return null;
    }
    ui.set({ detecting: false });
    return addFootprint(fp, p);
  } catch (e) {
    ui.set({
      detecting: false,
      detectError: `Le contour n’a pas pu être relevé (${(e as Error).message}). Réessayez dans un instant, ou dessinez-le à la main.`,
    });
    return null;
  }
}

/** Ajoute une emprise déjà relevée (candidat proposé, détection) au site, ou sélectionne le bâtiment s'il y est. */
export function addFootprint(fp: Footprint, p: LngLat): Batiment {
  const again = useProject.getState().batiments.find((b) => b.sourceRef === fp.sourceRef);
  if (again) {
    useUi.getState().selectBatiment(again.id);
    return again;
  }
  ensureSite(p);
  const sigma = fp.precision / Math.SQRT2;
  const n = useProject.getState().batiments.length;
  const b: Batiment = {
    id: uid('bat'),
    siteId: useProject.getState().site!.id,
    nom: `Bâtiment ${String.fromCharCode(65 + n)}`,
    contour: fp.contour,
    sigmas: fp.contour.map(() => sigma),
    hauteur: fp.hauteur ? Math.round(fp.hauteur * 10) / 10 : DEFAULT_HEIGHT,
    niveaux: fp.niveaux || 1,
    source: fp.source,
    sourceRef: fp.sourceRef,
    rnb: fp.rnb,
    usage: fp.usage,
    precisionSource: fp.precision,
  };
  useProject.getState().upsertBatiment(b);
  useUi.getState().selectBatiment(b.id);
  useMapUi.getState().set({ detectError: undefined, lastAddedId: b.id, lastAddedAt: performance.now() });
  return b;
}

function ensureSite(p: LngLat) {
  const project = useProject.getState();
  if (project.site) return;
  project.setSite({
    id: project.activeId,
    organisationId: project.organisation.id,
    nom: `Usine ${project.usines.length}`,
    adresse: 'Point choisi sur la carte',
    coordonnees: p,
    repere: { origin: p, angleDeg: 0 },
  });
}

export function finishDrawing() {
  const ui = useMapUi.getState();
  const pts = ui.drawPoints;
  if (pts.length < 3) return;
  ensureSite(pts[0]);
  const n = useProject.getState().batiments.length;
  const sigma = handSigma(ui.mpp);
  const b: Batiment = {
    id: uid('bat'),
    siteId: useProject.getState().site!.id,
    nom: `Bâtiment ${String.fromCharCode(65 + n)}`,
    contour: pts,
    sigmas: pts.map(() => sigma),
    hauteur: DEFAULT_HEIGHT,
    niveaux: 1,
    source: 'manuel',
  };
  useProject.getState().upsertBatiment(b);
  useUi.getState().selectBatiment(b.id);
  ui.set({ mode: 'edit', drawPoints: [], lastAddedId: b.id, lastAddedAt: performance.now() });
}
