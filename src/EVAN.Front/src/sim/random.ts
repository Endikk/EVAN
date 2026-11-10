/** Aléa déterministe (reproductible d'une visite à l'autre) pour l'historique simulé. */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit pseudo-aléatoire stable en fonction d'un entier (même entrée → même sortie). */
export function hashNoise(seed: number, i: number): number {
  let x = (seed ^ Math.imul(i, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Approximation gaussienne centrée réduite (somme de 4 uniformes). */
export function gaussFrom(u: () => number): number {
  return (u() + u() + u() + u() - 2) * 1.732;
}

export function gauss(): number {
  return gaussFrom(Math.random);
}

export function stableGauss(seed: number, i: number): number {
  return (hashNoise(seed, i * 4) + hashNoise(seed, i * 4 + 1) + hashNoise(seed, i * 4 + 2) + hashNoise(seed, i * 4 + 3) - 2) * 1.732;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

let idCounter = 0;
export function uid(prefix: string): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}
