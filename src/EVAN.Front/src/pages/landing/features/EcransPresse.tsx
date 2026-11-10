/**
 * Les deux écrans de la presse (nœuds `ecran_ihm` du modèle, impression et découpe) redessinés avec la vitesse et
 * l'état que montre la page. Leur image d'origine affiche une vitesse figée (152 m/min) : à l'arrêt, la presse aurait
 * dit autre chose que la carte posée à côté. Les barres montrent l'historique réel de la vitesse affichée (pendant
 * le film, celui de son horloge). L'image n'est redessinée que quand ce qu'elle affiche change.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PRESSE } from '../lib/sections';

interface Etat {
  /** Vitesse rapportée à la nominale. */
  facteur: number;
  panne: boolean;
  /** Vitesse rapportée à la nominale il y a `k` images : l'historique affiché par les barres. */
  passe(k: number): number;
}

interface Props {
  /** Lu à chaque image. */
  etat(): Etat;
  /** Vrai : l'écran suit la presse avec la même inertie que ses rouleaux. Faux : la valeur est déjà lissée. */
  amorti: boolean;
}

const L = 320;
const H = 200;
/** Couleurs de l'image d'origine du modèle. */
const FOND = '#0b131d';
const BARRE = '#1d2a38';
const CYAN = '#4fb3d1';
const BANDEAU = '#0d6a85';
const VERT = '#2fd07f';
const ROUGE = '#ff3d6e';
/** Historique : 15 barres, une toutes les 8 images, la dernière est la vitesse du moment. Rien d'inventé. */
const BARRES = 15;
const PAS_BARRE = 8;

interface Ecran {
  /** Police du texte, lue une fois sur les jetons de la page. */
  police: string;
  mat: THREE.MeshStandardMaterial;
  avant: THREE.Texture | null;
  tex: THREE.CanvasTexture;
  ctx: CanvasRenderingContext2D;
  titre: string;
}

function dessiner(e: Ecran, vitesse: number, panne: boolean, historique: number[]) {
  const { ctx } = e;
  const { max, unite } = PRESSE.vitesse;
  const { police } = e;
  ctx.fillStyle = FOND;
  ctx.fillRect(0, 0, L, H);
  const n = historique.length;
  const pas = (L - 32) / n;
  historique.forEach((v, i) => {
    const h = Math.max(2, Math.min(1, v / max) * 40);
    ctx.fillStyle = i === n - 1 ? CYAN : BARRE;
    ctx.fillRect(16 + i * pas, 10 + 40 - h, pas - 3, h);
  });
  ctx.fillStyle = BARRE;
  ctx.fillRect(16, 70, L - 32, 9);
  ctx.fillStyle = CYAN;
  ctx.fillRect(16, 70, (L - 32) * Math.min(1, vitesse / max), 9);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `700 58px ${police}`;
  const texte = String(Math.round(vitesse));
  ctx.fillText(texte, 16, 145);
  const w = ctx.measureText(texte).width;
  ctx.fillStyle = '#9fb4c8';
  ctx.font = `500 17px ${police}`;
  ctx.fillText(unite, 16 + w + 8, 112);
  ctx.fillStyle = BANDEAU;
  ctx.fillRect(0, 164, L, H - 164);
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 19px ${police}`;
  ctx.fillText(e.titre, 16, 190);
  // Ces écrans montrent la presse simulée de la page, pas la vraie machine : ils le disent.
  ctx.fillStyle = '#bfe3ee';
  ctx.font = `500 13px ${police}`;
  ctx.textAlign = 'right';
  ctx.fillText('simulation', L - 44, 187);
  ctx.textAlign = 'left';
  ctx.fillStyle = panne ? ROUGE : VERT;
  ctx.beginPath();
  ctx.arc(L - 26, 182, 7, 0, Math.PI * 2);
  ctx.fill();
  e.tex.needsUpdate = true;
}

export function EcransPresse({ etat, amorti }: Props) {
  const scene = useThree((s) => s.scene);
  const ecrans = useRef<Ecran[]>([]);
  const vu = useRef({ v: -1, panne: false, lisse: etat().facteur, trace: '', images: 0 });
  // Historique affiché, une valeur par barre : pendant le film, celui de son horloge ; ensuite, il continue à la même
  // cadence avec la vitesse du moment, sans repartir de zéro.
  const histoire = useRef<number[]>(Array.from({ length: BARRES }, () => 0));

  useEffect(() => {
    const trouves: Ecran[] = [];
    const p = new THREE.Vector3();
    const police = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
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
      // Le pupitre est côté entrée de la presse, l'écran de découpe côté sortie.
      const titre = mesh.getWorldPosition(p).x < 0 ? 'IMPRESSION FLEXO' : 'DÉCOUPE';
      trouves.push({ police, mat, avant: mat.map, tex, ctx, titre });
      mat.map = tex;
    });
    ecrans.current = trouves;
    vu.current.v = -1;
    return () => {
      for (const e of trouves) {
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
      histoire.current = Array.from({ length: BARRES }, (_, i) => Math.round(Math.max(0, passe((BARRES - 1 - i) * PAS_BARRE)) * nominale));
    } else if (++s.images % PAS_BARRE === 0) {
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
