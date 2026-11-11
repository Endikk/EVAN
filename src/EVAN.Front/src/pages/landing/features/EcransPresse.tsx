/**
 * Les deux écrans de la presse (nœuds `ecran_ihm` du modèle, impression et découpe) tenus à jour avec la vitesse et
 * l'état que montre la page. L'image d'écran du modèle (data/kit/blender/textures/sources/ecrans.cjs) sert de fond ;
 * seules ses zones vivantes sont repeintes : la tuile de vitesse, la courbe des dernières secondes et le bandeau
 * d'état. À l'arrêt ou en panne, l'écran dit donc la même chose que la carte posée à côté. La tendance trace
 * l'historique réel de la vitesse affichée (pendant le film, celui de son horloge). L'image n'est repeinte que quand ce
 * qu'elle affiche change.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PRESSE } from '../lib/sections';

interface Etat {
  /** Vitesse rapportée à la nominale. */
  facteur: number;
  panne: boolean;
  /** Vitesse rapportée à la nominale il y a `k` images : l'historique affiché par la tendance. */
  passe(k: number): number;
}

interface Props {
  /** Lu à chaque image. */
  etat(): Etat;
  /** Vrai : l'écran suit la presse avec la même inertie que ses rouleaux. Faux : la valeur est déjà lissée. */
  amorti: boolean;
}

/** Taille de l'image d'écran du modèle, et ses zones vivantes : les mêmes que ZONES dans ecrans.cjs. */
const L = 1024;
const H = 640;
const ZONE_VITESSE = { x: 664, y: 64, w: 344, h: 132 };
const ZONE_TENDANCE = { x: 16, y: 424, w: 992, h: 132 };
const ZONE_ETAT = { x: 16, y: 564, w: 992, h: 28 };
/** Police et couleurs de l'image d'écran, pour que les zones repeintes ne se distinguent pas du reste. */
const POLICE = 'Arial, Helvetica, sans-serif';
const C = {
  panneau: '#1a2531',
  bord: '#2b3b4c',
  texte: '#e6edf3',
  doux: '#8fa3b5',
  accent: '#4fb3d1',
  vert: '#2fd07f',
  rouge: '#ff3d6e',
  fondOk: '#163d2a',
  fondPanne: '#4a1424',
};
/** Historique : 15 points, un toutes les 8 images, le dernier est la vitesse du moment. Rien d'inventé. */
const POINTS = 15;
const PAS_POINT = 8;

interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Ecran {
  mat: THREE.MeshStandardMaterial;
  avant: THREE.Texture | null;
  /** Image d'origine de l'écran, redessinée en fond à chaque fois. */
  fond: CanvasImageSource | null;
  tex: THREE.CanvasTexture;
  ctx: CanvasRenderingContext2D;
}

/** Pas de graduation de la tendance : le même calcul que pasRond() dans ecrans.cjs. */
function pasRond(brut: number): number {
  const p = 10 ** Math.floor(Math.log10(brut));
  return [1, 2, 2.5, 4, 5, 7.5, 10].map((k) => k * p).find((v) => v >= brut) ?? 10 * p;
}

function panneau(ctx: CanvasRenderingContext2D, z: Zone, titre: string) {
  ctx.fillStyle = C.panneau;
  ctx.strokeStyle = C.bord;
  ctx.beginPath();
  ctx.roundRect(z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1, 6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = C.doux;
  ctx.font = `11px ${POLICE}`;
  ctx.letterSpacing = '1px';
  ctx.fillText(titre.toUpperCase(), z.x + 14, z.y + 22);
  ctx.letterSpacing = '0px';
}

function tuileVitesse(ctx: CanvasRenderingContext2D, vitesse: number) {
  const { max, unite } = PRESSE.vitesse;
  const z = ZONE_VITESSE;
  panneau(ctx, z, 'Vitesse');
  ctx.fillStyle = C.texte;
  ctx.font = `700 58px ${POLICE}`;
  const texte = String(Math.round(vitesse));
  ctx.fillText(texte, z.x + 14, z.y + 86);
  ctx.fillStyle = C.doux;
  ctx.font = `16px ${POLICE}`;
  ctx.fillText(unite, z.x + 14 + ctx.measureText(texte).width + 22, z.y + 86);
  ctx.fillStyle = C.bord;
  ctx.beginPath();
  ctx.roundRect(z.x + 14, z.y + 104, z.w - 28, 10, 5);
  ctx.fill();
  ctx.fillStyle = C.accent;
  ctx.beginPath();
  ctx.roundRect(z.x + 14, z.y + 104, Math.max(10, (z.w - 28) * Math.min(1, vitesse / max)), 10, 5);
  ctx.fill();
  ctx.fillStyle = C.doux;
  ctx.font = `11px ${POLICE}`;
  ctx.textAlign = 'right';
  ctx.fillText(`max ${max}`, z.x + z.w - 14, z.y + 128);
  ctx.textAlign = 'left';
}

function tendance(ctx: CanvasRenderingContext2D, historique: number[]) {
  const { max, unite } = PRESSE.vitesse;
  const z = ZONE_TENDANCE;
  // 15 points pris toutes les PAS_POINT images : quelques secondes d'historique, le titre le dit.
  panneau(ctx, z, `Vitesse en direct, dernières secondes (${unite})`);
  const pas = pasRond(max / 4);
  const haut = pas * 4;
  const x0 = z.x + 44;
  const x1 = z.x + z.w - 14;
  ctx.font = `10px ${POLICE}`;
  ctx.textAlign = 'right';
  for (let k = 0; k <= 4; k++) {
    const y = z.y + 32 + k * 22;
    ctx.strokeStyle = C.bord;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.fillStyle = C.doux;
    ctx.fillText(String(haut - k * pas), z.x + 38, y + 4);
  }
  ctx.textAlign = 'left';
  ctx.strokeStyle = C.accent;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  historique.forEach((v, i) => {
    const x = x0 + ((x1 - x0) * i) / (historique.length - 1);
    const y = z.y + 32 + 88 * (1 - Math.min(1, Math.max(0, v / haut)));
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.lineWidth = 1;
}

function bandeau(ctx: CanvasRenderingContext2D, panne: boolean) {
  const z = ZONE_ETAT;
  ctx.fillStyle = panne ? C.fondPanne : C.fondOk;
  ctx.beginPath();
  ctx.roundRect(z.x, z.y, z.w, z.h, 4);
  ctx.fill();
  ctx.fillStyle = panne ? C.rouge : C.vert;
  ctx.beginPath();
  ctx.arc(z.x + 16, z.y + 14, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.texte;
  ctx.font = `13px ${POLICE}`;
  ctx.fillText(panne ? 'Défaut en cours : machine arrêtée' : 'Aucune alarme active', z.x + 30, z.y + 19);
  // Ces écrans montrent la presse simulée de la page, pas une vraie machine : ils le disent.
  ctx.fillStyle = C.doux;
  ctx.font = `12px ${POLICE}`;
  ctx.textAlign = 'right';
  ctx.fillText('Données simulées', z.x + z.w - 12, z.y + 19);
  ctx.textAlign = 'left';
}

function dessiner(e: Ecran, vitesse: number, panne: boolean, historique: number[]) {
  const { ctx } = e;
  if (e.fond) ctx.drawImage(e.fond, 0, 0, L, H);
  else {
    ctx.fillStyle = '#121a23';
    ctx.fillRect(0, 0, L, H);
  }
  tuileVitesse(ctx, vitesse);
  tendance(ctx, historique);
  bandeau(ctx, panne);
  e.tex.needsUpdate = true;
}

export function EcransPresse({ etat, amorti }: Props) {
  const scene = useThree((s) => s.scene);
  const ecrans = useRef<Ecran[]>([]);
  const vu = useRef({ v: -1, panne: false, lisse: etat().facteur, trace: '', images: 0 });
  // Historique affiché, un point toutes les PAS_POINT images : pendant le film, celui de son horloge ; ensuite, il
  // continue à la même cadence avec la vitesse du moment, sans repartir de zéro.
  const histoire = useRef<number[]>(Array.from({ length: POINTS }, () => 0));

  useEffect(() => {
    const trouves: Ecran[] = [];
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh.userData as { role?: string }).role !== 'ecran') return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      const canvas = document.createElement('canvas');
      canvas.width = L;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx || Array.isArray(mesh.material)) return;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      // Les UV du modèle suivent la convention glTF, comme la texture qu'il porte : pas de retournement.
      tex.flipY = false;
      const fond = (mat.map?.image as CanvasImageSource | undefined) ?? null;
      trouves.push({ mat, avant: mat.map, fond, tex, ctx });
      mat.map = tex;
      // L'écran émet sa propre image : la texture d'émission suit la nouvelle.
      if (mat.emissiveMap) mat.emissiveMap = tex;
    });
    ecrans.current = trouves;
    vu.current.v = -1;
    return () => {
      for (const e of trouves) {
        if (e.mat.emissiveMap === e.tex) e.mat.emissiveMap = e.avant;
        e.mat.map = e.avant;
        e.tex.dispose();
      }
      ecrans.current = [];
    };
  }, [scene]);

  useFrame((_, dt) => {
    if (!ecrans.current.length) return;
    const { facteur, panne, passe } = etat();
    const s = vu.current;
    const nominale = PRESSE.vitesse.nominale;
    s.lisse = amorti ? s.lisse + (facteur - s.lisse) * Math.min(1, dt * 1.8) : facteur;
    const v = Math.round(Math.max(0, s.lisse) * nominale);
    if (!amorti) {
      histoire.current = Array.from({ length: POINTS }, (_, i) => Math.round(Math.max(0, passe((POINTS - 1 - i) * PAS_POINT)) * nominale));
    } else if (++s.images % PAS_POINT === 0) {
      histoire.current = [...histoire.current.slice(1), v];
    }
    const historique = [...histoire.current.slice(0, -1), v];
    const trace = historique.join(',');
    if (v === s.v && panne === s.panne && trace === s.trace) return;
    s.v = v;
    s.panne = panne;
    s.trace = trace;
    for (const e of ecrans.current) dessiner(e, v, panne, historique);
  });
  return null;
}
