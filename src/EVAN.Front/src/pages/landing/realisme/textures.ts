/**
 * Textures du kit affinées pour l'accueil : elles font 128 ou 256 px, assez pour le plan de l'usine, floues dans les
 * gros plans du film. Chacune est agrandie quatre fois ; les flancs de bobine (disques de papier enroulé) reçoivent
 * en plus les spires fines que l'agrandissement ne peut pas inventer. Les cadrans gardent leur dessin.
 *
 * La texture d'origine n'est pas touchée : elle appartient au cache de useGLTF, que le plan de l'usine partage.
 */
import * as THREE from 'three';
import type { Classe } from './matieres';

const TAILLE_MAX = 1024;
const FACTEUR = 4;

type Image = CanvasImageSource & { width: number; height: number };

/** Générateur pseudo-aléatoire déterministe : la même bobine a les mêmes spires à chaque visite. */
function alea(graine: number) {
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Disque de papier enroulé : coins transparents, centre plein, sans aiguille rouge (un cadran en a une). Lu sur
 * l'image d'origine, seize fois plus petite que la copie agrandie.
 */
function estFlanc(img: Image): boolean {
  const { width: w, height: h } = img;
  if (w !== h) return false;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const a = (x: number, y: number) => px[(Math.floor(y) * w + Math.floor(x)) * 4 + 3];
  if (a(1, 1) > 16 || a(w - 2, h - 2) > 16 || a(w / 2, h / 2) < 240) return false;
  for (let i = 0; i < px.length; i += 16) if (px[i] > 150 && px[i + 1] < 90 && px[i + 2] < 90) return false;
  return true;
}

function spires(ctx: CanvasRenderingContext2D, w: number, graine: number) {
  const r = alea(graine);
  const c = w / 2;
  ctx.save();
  // Seulement sur le disque : les coins restent transparents.
  ctx.globalCompositeOperation = 'source-atop';
  for (let rayon = w * 0.02; rayon < c - 1; rayon += 0.6 + r() * 1.6) {
    const clair = r() > 0.55;
    ctx.strokeStyle = clair ? `rgba(255,255,255,${0.03 + r() * 0.06})` : `rgba(60,48,30,${0.025 + r() * 0.07})`;
    ctx.lineWidth = 0.6 + r() * 0.9;
    ctx.beginPath();
    ctx.arc(c, c, rayon, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Quelques spires plus marquées : un changement de lot, une tension différente.
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(70,55,35,${0.08 + r() * 0.08})`;
    ctx.lineWidth = 1 + r() * 1.5;
    ctx.beginPath();
    ctx.arc(c, c, c * (0.3 + r() * 0.68), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

let compte = 0;

/** Copie agrandie d'une texture du kit, ou la texture telle quelle si son image n'est pas lisible. */
export function affinerTexture(t: THREE.Texture, c: Classe): THREE.Texture {
  const img = t.image as Image | undefined;
  if (typeof document === 'undefined' || !img?.width || !img.height || c !== 'imprime') return t;
  const k = Math.min(FACTEUR, TAILLE_MAX / Math.max(img.width, img.height));
  if (k <= 1) return t;
  const w = Math.round(img.width * k);
  const h = Math.round(img.height * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return t;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  if (estFlanc(img)) spires(ctx, w, 0x9e3779b9 + compte++);
  const n = t.clone();
  n.source = new THREE.TextureSource(canvas);
  n.anisotropy = 8;
  n.needsUpdate = true;
  return n;
}
