/**
 * Sources de tuiles satellite et composition d'une orthophoto locale pour le sol de la scène 3D
 * (continuité visuelle entre la carte et le plan 3D).
 */
import { fromLocal, toLocal, type Frame, type LngLat, type XY } from './geodesy';

export const IGN_ORTHO =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image/jpeg';
export const ESRI_WORLD = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const BDTOPO_VECTOR = 'https://data.geopf.fr/tms/1.0.0/BDTOPO/{z}/{x}/{y}.pbf';
export const OPENFREEMAP = 'https://tiles.openfreemap.org/planet';

/** Emprise approximative de la France métropolitaine et de la Corse (couverture BD ORTHO / BD TOPO). */
export function inFrance([lng, lat]: LngLat): boolean {
  return lng > -5.5 && lng < 9.8 && lat > 41.2 && lat < 51.2;
}

const lng2x = (lng: number, z: number) => ((lng + 180) / 360) * 2 ** z;
const lat2y = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const x2lng = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const y2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(url));
    img.src = url;
  });
}

const tileUrl = (tpl: string, z: number, x: number, y: number) => tpl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));

export interface GroundImage {
  canvas: HTMLCanvasElement;
  /** Coins de l'image (haut-gauche, haut-droit, bas-droit, bas-gauche) dans le repère local. */
  corners: [XY, XY, XY, XY];
  source: 'ign' | 'esri';
}

/**
 * Compose les tuiles couvrant un rectangle local (centre, demi-tailles, marge) à un niveau de zoom
 * adapté à la taille (≤ 3 000 px de côté).
 */
export async function composeGround(frame: Frame, center: XY, half: XY, margin = 70): Promise<GroundImage | null> {
  const corners: XY[] = [
    [center[0] - half[0] - margin, center[1] - half[1] - margin],
    [center[0] + half[0] + margin, center[1] - half[1] - margin],
    [center[0] + half[0] + margin, center[1] + half[1] + margin],
    [center[0] - half[0] - margin, center[1] + half[1] + margin],
  ];
  const ll = corners.map((c) => fromLocal(frame, c));
  const minLng = Math.min(...ll.map((p) => p[0]));
  const maxLng = Math.max(...ll.map((p) => p[0]));
  const minLat = Math.min(...ll.map((p) => p[1]));
  const maxLat = Math.max(...ll.map((p) => p[1]));
  const france = inFrance(frame.origin);
  let z = 19;
  while (z > 14 && (lng2x(maxLng, z) - lng2x(minLng, z) > 12 || lat2y(minLat, z) - lat2y(maxLat, z) > 12)) z--;
  const x0 = Math.floor(lng2x(minLng, z));
  const x1 = Math.floor(lng2x(maxLng, z));
  const y0 = Math.floor(lat2y(maxLat, z));
  const y1 = Math.floor(lat2y(minLat, z));
  const canvas = document.createElement('canvas');
  canvas.width = (x1 - x0 + 1) * 256;
  canvas.height = (y1 - y0 + 1) * 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#6b6f63';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let source: GroundImage['source'] = france ? 'ign' : 'esri';
  const jobs: Promise<void>[] = [];
  let failures = 0;
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const draw = (img: HTMLImageElement) => ctx.drawImage(img, (x - x0) * 256, (y - y0) * 256, 256, 256);
      jobs.push(
        loadImage(tileUrl(france ? IGN_ORTHO : ESRI_WORLD, z, x, y))
          .then(draw)
          .catch(async () => {
            failures++;
            try {
              draw(await loadImage(tileUrl(ESRI_WORLD, z, x, y)));
              source = 'esri';
            } catch {
              /* tuile manquante : reste grise */
            }
          }),
      );
    }
  }
  await Promise.all(jobs);
  if (failures === jobs.length && source === 'esri' && !france) return null;
  const nw: LngLat = [x2lng(x0, z), y2lat(y0, z)];
  const ne: LngLat = [x2lng(x1 + 1, z), y2lat(y0, z)];
  const se: LngLat = [x2lng(x1 + 1, z), y2lat(y1 + 1, z)];
  const sw: LngLat = [x2lng(x0, z), y2lat(y1 + 1, z)];
  return { canvas, corners: [toLocal(frame, nw), toLocal(frame, ne), toLocal(frame, se), toLocal(frame, sw)], source };
}
