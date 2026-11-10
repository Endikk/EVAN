/**
 * Caméra du film d'ouverture. D'abord un travelling au ras de la presse, du dérouleur au dernier rouleau, sur une
 * courbe qui passe par cinq poses (de près, un peu de biais, la caméra regarde toujours là où la lumière balaie).
 * Puis un recul jusqu'à la vue de repos, le dernier rouleau épinglé à l'écran : le décalage de vue (setViewOffset)
 * le ramène peu à peu à sa place de repos, si bien que la caméra retombe exactement sur la vue habituelle.
 */
import * as THREE from 'three';
import type { Pt } from './geometrie';
import type { Canaux } from './timeline';

const D2R = Math.PI / 180;

export type Vec3 = [number, number, number];

export interface Pose {
  cible: Vec3;
  az: number;
  el: number;
  dist: number;
}

/** Pose complète appliquée à la caméra : la pose et son décalage de vue (px). */
export interface PoseEcran extends Pose {
  ox: number;
  oy: number;
}

export interface Sujets {
  /** Moyeu du dernier rouleau (rembobineur), sur sa face avant, dans le repère de la scène. */
  rouleau: Vec3;
}

export interface Plan {
  repos: PoseEcran;
  /** Le dernier rouleau à l'écran dans la vue de repos : là où le recul le ramène. */
  rouleauEcran: Pt;
}

/**
 * Le travelling, dans le repère de la scène (la presse va de x = -4,2 à 4,2 m) : le dérouleur de près, les groupes
 * d'impression et leurs encres, la dorure et le séchage, la découpe, puis le dernier rouleau, presque de face.
 */
const TRAVELLING: Pose[] = [
  { cible: [-3.45, 1.0, 0.2], az: 58, el: 5, dist: 2.7 },
  { cible: [-1.7, 1.02, 0.25], az: 36, el: 9, dist: 3.1 },
  { cible: [0.5, 1.15, 0.2], az: 22, el: 11, dist: 3.1 },
  { cible: [2.3, 1.05, 0.15], az: 14, el: 8, dist: 3.2 },
  { cible: [3.295, 1.0, 0.07], az: 8, el: 5, dist: 3.4 },
];

/** La lumière balaie juste devant ce que regarde la caméra. */
const AVANCE_SCAN = 0.55;

const cam = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

/** Place la caméra sur une pose, sans décalage de vue. */
export function placer(c: THREE.PerspectiveCamera, p: Pose, w: number, h: number) {
  const a = p.az * D2R;
  const e = p.el * D2R;
  c.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(p.dist).add(v.set(...p.cible));
  c.lookAt(v.set(...p.cible));
  c.setViewOffset(w, h, 0, 0, w, h);
  c.updateMatrixWorld();
}

/** Position à l'écran (px de la toile) d'un point de la scène, pour la caméra telle qu'elle est placée. */
export function projeter(c: THREE.PerspectiveCamera, p: Vec3, w: number, h: number): Pt {
  v.set(...p).project(c);
  return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** Entre deux poses. La distance varie en proportion (un recul de 3 à 20 m paraît régulier), pas en mètres. */
export function entre(a: Pose, b: Pose, k: number): Pose {
  return {
    cible: [mix(a.cible[0], b.cible[0], k), mix(a.cible[1], b.cible[1], k), mix(a.cible[2], b.cible[2], k)],
    az: mix(a.az, b.az, k),
    el: mix(a.el, b.el, k),
    dist: a.dist * Math.pow(b.dist / a.dist, k),
  };
}

/** Catmull-Rom sur une suite de valeurs, `k` de 0 à 1 sur toute la suite : la courbe passe par chaque valeur. */
function spline(vals: number[], k: number): number {
  const n = vals.length - 1;
  const s = Math.min(n - 1e-9, Math.max(0, k * n));
  const i = Math.floor(s);
  const u = s - i;
  const p0 = vals[Math.max(0, i - 1)];
  const p1 = vals[i];
  const p2 = vals[i + 1];
  const p3 = vals[Math.min(n, i + 2)];
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
}

/** Pose du travelling à l'avancement `k`. */
export function poseTravelling(k: number): Pose {
  const comp = (f: (p: Pose) => number) => spline(TRAVELLING.map(f), k);
  return {
    cible: [comp((p) => p.cible[0]), comp((p) => p.cible[1]), comp((p) => p.cible[2])],
    az: comp((p) => p.az),
    el: comp((p) => p.el),
    dist: Math.exp(comp((p) => Math.log(p.dist))),
  };
}

/** Front de la lumière (x, en m) à l'avancement `k` du travelling : un peu devant ce que regarde la caméra. */
export const frontScan = (k: number) => poseTravelling(k).cible[0] + AVANCE_SCAN;

/** Prépare le recul pour une toile donnée, à partir de la vue de repos calculée par le cadrage. */
export function planifier(repos: PoseEcran, s: Sujets, w: number, h: number, fov: number): Plan {
  cam.fov = fov;
  cam.aspect = w / h;
  cam.near = 0.1;
  cam.far = 200;
  placer(cam, repos, w, h);
  const r = projeter(cam, s.rouleau, w, h);
  return { repos, rouleauEcran: { x: r.x - repos.ox, y: r.y - repos.oy } };
}

/**
 * Pose de la caméra à l'image décrite par `k`. Écrit la caméra et renvoie la pose, pour que la caméra habituelle
 * reparte de là quand le film rend la main.
 */
export function poseDuFilm(c: THREE.PerspectiveCamera, k: Canaux, plan: Plan, s: Sujets, w: number, h: number): PoseEcran {
  if (k.recul <= 0) {
    const pose = poseTravelling(k.travelling);
    placer(c, pose, w, h);
    return { ...pose, ox: 0, oy: 0 };
  }
  const pose = entre(TRAVELLING[TRAVELLING.length - 1], plan.repos, k.recul);
  placer(c, pose, w, h);
  // Le rouleau glisse de l'endroit où on le regardait jusqu'à sa place de repos, sans à-coup.
  const p0 = projeter(c, s.rouleau, w, h);
  const ox = (p0.x - plan.rouleauEcran.x) * k.recul;
  const oy = (p0.y - plan.rouleauEcran.y) * k.recul;
  c.setViewOffset(w, h, ox, oy, w, h);
  c.updateMatrixWorld();
  return { ...pose, ox, oy };
}
