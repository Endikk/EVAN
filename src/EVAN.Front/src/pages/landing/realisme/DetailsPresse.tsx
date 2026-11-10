/**
 * Pièces que le modèle du kit ne dessine pas et qu'on attend sur une vraie presse : vis à six pans creux sur les
 * bâtis, paliers et écrous au bout des axes, portes du socle avec leurs poignées et leurs grilles d'aération, arrêts
 * d'urgence, pictogrammes de danger, numéros des groupes d'impression. Elles sont placées à partir du modèle
 * lui-même (les faces avant de ses tôles, les bouts de ses axes) : si le kit change, elles suivent.
 *
 * Tout est instancié : une douzaine d'appels de dessin pour plusieurs centaines de pièces.
 */
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { classer, matiere, signature, type Classe } from './matieres';

/** Durée du fondu quand la presse s'estompe autour d'un organe (s), celle de MachineModel. */
const FONDU_S = 0.45;

interface Props {
  url: string;
  /** Presse estompée (organe ciblé) : les pièces ajoutées s'estompent avec elle. */
  estompe: number | null;
}

interface Piece {
  boite: THREE.Box3;
  classe: Classe;
  role?: string;
}

/** Pièces du modèle, rangées par classe de matière, dans le repère du modèle. */
function inventaire(scene: THREE.Object3D): Piece[] {
  scene.updateMatrixWorld(true);
  const pieces: Piece[] = [];
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || Array.isArray(mesh.material)) return;
    const role = (mesh.userData as { role?: string }).role;
    const classe = classer(signature(mesh.material, mesh));
    if (!classe && role !== 'ecran') return;
    pieces.push({ boite: new THREE.Box3().setFromObject(mesh), classe: classe ?? 'imprime', role });
  });
  return pieces;
}

const taille = (b: THREE.Box3) => b.getSize(new THREE.Vector3());
const centre = (b: THREE.Box3) => b.getCenter(new THREE.Vector3());

/** Un repère par instance : position, et rotation qui couche l'axe Y des géométries selon +z (face avant). */
type Pose = { p: THREE.Vector3; s?: THREE.Vector3 };
const VERS_AVANT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

function instances(geo: THREE.BufferGeometry, mat: THREE.Material, poses: Pose[], couche = true): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, poses.length));
  const m = new THREE.Matrix4();
  const q = couche ? VERS_AVANT : new THREE.Quaternion();
  poses.forEach(({ p, s }, i) => im.setMatrixAt(i, m.compose(p, q, s ?? new THREE.Vector3(1, 1, 1))));
  im.count = poses.length;
  im.castShadow = true;
  im.receiveShadow = true;
  im.computeBoundingBox();
  im.computeBoundingSphere();
  return im;
}

/** Quadrilatères face à +z, chacun avec sa portion de texture (u0, v0, u1, v1). */
function quads(items: { p: THREE.Vector3; w: number; h: number; uv: [number, number, number, number] }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  items.forEach(({ p, w, h, uv: [u0, v0, u1, v1] }, i) => {
    pos.push(p.x - w / 2, p.y - h / 2, p.z, p.x + w / 2, p.y - h / 2, p.z, p.x + w / 2, p.y + h / 2, p.z, p.x - w / 2, p.y + h / 2, p.z);
    uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    const k = i * 4;
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 2 ? 1 : 0)), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function toile(w: number, h: number, dessiner: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) dessiner(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Pictogramme « danger » : triangle jaune bordé de noir, point d'exclamation (ISO 7010 W001). */
function pictogramme(ctx: CanvasRenderingContext2D) {
  const w = 128;
  const h = 112;
  ctx.clearRect(0, 0, w, h);
  const tri = (m: number) => {
    ctx.beginPath();
    ctx.moveTo(w / 2, m);
    ctx.lineTo(w - m * 1.15, h - m * 0.7);
    ctx.lineTo(m * 1.15, h - m * 0.7);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.fillStyle = '#111111';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 10;
  tri(6);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f5c400';
  tri(19);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 6, 44);
  ctx.lineTo(w / 2 + 6, 44);
  ctx.lineTo(w / 2 + 3.5, 80);
  ctx.lineTo(w / 2 - 3.5, 80);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w / 2, 89, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

/** Plaques des numéros de groupe, côte à côte : chiffre clair gravé sur fond anthracite. */
function numeros(n: number) {
  return (ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < n; i++) {
      const x = i * 64;
      ctx.fillStyle = '#23272d';
      ctx.fillRect(x, 0, 64, 80);
      ctx.strokeStyle = '#4a5059';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 2, 2, 60, 76);
      ctx.fillStyle = '#e9edf2';
      ctx.font = '700 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x + 32, 43);
    }
  };
}

interface Jeu {
  objets: THREE.Object3D[];
  materiaux: THREE.Material[];
  jetables: { dispose(): void }[];
}

function construire(scene: THREE.Object3D): Jeu {
  const pieces = inventaire(scene);
  const toles = pieces.filter((p) => p.classe === 'tole');
  const plaques = toles.filter((p) => {
    const t = taille(p.boite);
    return t.z <= 0.1 && t.x >= 0.2 && t.y >= 0.5;
  });
  const montants = toles.filter((p) => {
    const t = taille(p.boite);
    return t.x <= 0.07 && t.z <= 0.07 && t.y >= 0.5 && p.boite.max.z > 0.3;
  });
  const traverses = toles.filter((p) => {
    const t = taille(p.boite);
    return t.y <= 0.09 && t.x >= 0.25 && p.boite.max.z > 0.3;
  });
  const axes = pieces.filter((p) => {
    const t = taille(p.boite);
    return p.classe === 'acier' && t.z >= 0.5 && t.x <= 0.08 && t.y <= 0.08;
  });
  const socle = pieces.filter((p) => p.classe === 'sombre' && taille(p.boite).x > 5).sort((a, b) => taille(b.boite).x - taille(a.boite).x)[0];
  const ecrans = pieces.filter((p) => p.role === 'ecran');

  // Matières.
  const noirci = matiere('acier', '#1b1d21', { roughness: 0.38 });
  const empreinte = matiere('caoutchouc', '#050506', { roughness: 0.85, sheen: 0 });
  const usine = matiere('acier', '#9aa1a9', { roughness: 0.32 });
  const brosse = matiere('acier', '#7d848d', { roughness: 0.34 });
  const joint = matiere('caoutchouc', '#030304', { roughness: 0.95, sheen: 0 });
  const jaune = matiere('plastique', '#e8b400', { roughness: 0.42, clearcoat: 0.2 });
  const rouge = matiere('plastique', '#c4121f', { roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.08 });
  const texPicto = toile(128, 112, pictogramme);
  const picto = matiere('plastique', '#ffffff', { map: texPicto, alphaTest: 0.5, roughness: 0.35, clearcoat: 0.3, polygonOffset: true, polygonOffsetFactor: -2 });
  const groupes = traverses.filter((p) => Math.abs(centre(p.boite).y - 1.345) < 0.03).sort((a, b) => a.boite.min.x - b.boite.min.x);
  const texNum = toile(64 * Math.max(1, groupes.length), 80, numeros(groupes.length));
  const numero = matiere('plastique', '#ffffff', { map: texNum, roughness: 0.4, clearcoat: 0.4, polygonOffset: true, polygonOffsetFactor: -2 });
  const materiaux = [noirci, empreinte, usine, brosse, joint, jaune, rouge, picto, numero];

  // Géométries : l'axe Y de chacune est couché selon +z (face avant) par `instances`.
  const tete = new THREE.CylinderGeometry(0.0062, 0.0062, 0.006, 20).translate(0, 0.003, 0);
  const six = new THREE.CylinderGeometry(0.0031, 0.0031, 0.0016, 6).translate(0, 0.0062, 0);
  const palier = new THREE.CylinderGeometry(0.034, 0.036, 0.012, 40).translate(0, 0.006, 0);
  const moyeu = new THREE.CylinderGeometry(0.022, 0.022, 0.024, 32).translate(0, 0.012, 0);
  const boulon = new THREE.CylinderGeometry(0.0045, 0.0045, 0.0045, 6).translate(0, 0.0145, 0);
  const ecrou = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
  const rainure = new THREE.BoxGeometry(1, 1, 1);
  const barre = new THREE.CapsuleGeometry(0.0055, 0.075, 6, 16);
  const pied = new THREE.CylinderGeometry(0.0042, 0.0042, 0.022, 12).translate(0, 0.011, 0);
  const boitier = new THREE.BoxGeometry(0.05, 0.05, 0.036, 2, 2, 2);
  const collerette = new THREE.CylinderGeometry(0.019, 0.021, 0.006, 32).translate(0, 0.003, 0);
  const champignon = new THREE.SphereGeometry(0.017, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.1).scale(1, 0.55, 1).translate(0, 0.012, 0);
  const tige = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 20).translate(0, 0.006, 0);

  // Vis des bâtis : coins des tôles verticales, pied des montants, bouts des traverses.
  const vis: Pose[] = [];
  for (const p of plaques) {
    const b = p.boite;
    const ex = Math.min(0.03, taille(b).x * 0.12);
    for (const x of [b.min.x + ex, b.max.x - ex]) for (const y of [b.min.y + 0.05, b.max.y - 0.04]) vis.push({ p: new THREE.Vector3(x, y, b.max.z) });
  }
  for (const p of montants) {
    const b = p.boite;
    const x = centre(b).x;
    for (const y of [b.min.y + 0.035, b.min.y + 0.085]) vis.push({ p: new THREE.Vector3(x, y, b.max.z) });
  }
  for (const p of traverses) {
    const b = p.boite;
    const y = centre(b).y;
    for (const x of [b.min.x + 0.025, b.max.x - 0.025]) vis.push({ p: new THREE.Vector3(x, y, b.max.z) });
  }

  // Paliers là où un axe traverse une tôle, écrou au bout libre de l'axe.
  const paliers: Pose[] = [];
  const boulons: Pose[] = [];
  const ecrous: Pose[] = [];
  for (const a of axes) {
    const c = centre(a.boite);
    const r = Math.max(taille(a.boite).x, taille(a.boite).y) / 2;
    const appui = plaques.find((p) => p.boite.min.x - 0.01 <= c.x && c.x <= p.boite.max.x + 0.01 && p.boite.min.y <= c.y && c.y <= p.boite.max.y && p.boite.max.z < c.z);
    if (appui) {
      const z = appui.boite.max.z;
      paliers.push({ p: new THREE.Vector3(c.x, c.y, z) });
      for (let i = 0; i < 4; i++) {
        const t = Math.PI / 4 + (i * Math.PI) / 2;
        boulons.push({ p: new THREE.Vector3(c.x + Math.cos(t) * 0.028, c.y + Math.sin(t) * 0.028, z) });
      }
    }
    ecrous.push({ p: new THREE.Vector3(c.x, c.y, a.boite.max.z - 0.004), s: new THREE.Vector3(r * 1.5, 0.012, r * 1.5) });
  }

  // Socle : portes, rainures, poignées, grilles d'aération, arrêts d'urgence aux deux bouts.
  const rainures: Pose[] = [];
  const poignees: Pose[] = [];
  const pieds: Pose[] = [];
  const grilles: Pose[] = [];
  const boitiers: Pose[] = [];
  const arrets: Pose[] = [];
  if (socle) {
    const b = socle.boite;
    const z = b.max.z;
    const portes = 8;
    const x0 = b.min.x + 0.06;
    const x1 = b.max.x - 0.06;
    const largeurPorte = (x1 - x0) / portes;
    const bas = b.min.y + 0.035;
    const haut = b.min.y + 0.255;
    // Rainure du soubassement et des deux bords des portes.
    rainures.push({ p: new THREE.Vector3((x0 + x1) / 2, bas - 0.006, z + 0.0004), s: new THREE.Vector3(x1 - x0, 0.004, 0.002) });
    for (let i = 0; i <= portes; i++) {
      const x = x0 + i * largeurPorte;
      rainures.push({ p: new THREE.Vector3(x, (bas + haut) / 2, z + 0.0004), s: new THREE.Vector3(0.004, haut - bas, 0.002) });
    }
    for (let i = 0; i < portes; i++) {
      const xa = x0 + i * largeurPorte;
      const xm = xa + largeurPorte / 2;
      // Poignée côté opposé aux charnières, à mi-hauteur.
      const xp = xa + largeurPorte - 0.045;
      poignees.push({ p: new THREE.Vector3(xp, (bas + haut) / 2, z + 0.022) });
      for (const dy of [-0.037, 0.037]) pieds.push({ p: new THREE.Vector3(xp, (bas + haut) / 2 + dy, z) });
      if (i % 2 === 0) {
        for (let k = 0; k < 7; k++) grilles.push({ p: new THREE.Vector3(xm - 0.03, bas + 0.06 + k * 0.022, z + 0.0005), s: new THREE.Vector3(largeurPorte * 0.42, 0.007, 0.002) });
      }
    }
    for (const x of [b.min.x + 0.035, b.max.x - 0.035]) {
      boitiers.push({ p: new THREE.Vector3(x, b.min.y + 0.2, z + 0.018) });
      arrets.push({ p: new THREE.Vector3(x, b.min.y + 0.2, z + 0.036) });
    }
  }
  // Un arrêt d'urgence sous chaque pupitre.
  for (const e of ecrans) {
    const b = e.boite;
    boitiers.push({ p: new THREE.Vector3(b.max.x + 0.045, b.min.y + 0.01, centre(b).z - 0.02) });
    arrets.push({ p: new THREE.Vector3(b.max.x + 0.045, b.min.y + 0.01, centre(b).z - 0.002) });
  }

  // Pictogrammes de danger sur un montant de chaque groupe, plaques de numéro sur les traverses des groupes flexo.
  const montantsTries = [...montants].sort((a, b) => a.boite.min.x - b.boite.min.x);
  const pictos = montantsTries
    .filter((_, i) => i % 2 === 0)
    .map((p) => ({ p: new THREE.Vector3(centre(p.boite).x, p.boite.min.y + 0.82, p.boite.max.z + 0.0006), w: 0.036, h: 0.0315, uv: [0, 0, 1, 1] as [number, number, number, number] }));
  const plaquesNum = groupes.map((p, i) => ({
    p: new THREE.Vector3(centre(p.boite).x + 0.085, centre(p.boite).y, p.boite.max.z + 0.0006),
    w: 0.032,
    h: 0.04,
    uv: [i / groupes.length, 0, (i + 1) / groupes.length, 1] as [number, number, number, number],
  }));

  const objets: THREE.Object3D[] = [
    instances(tete, noirci, vis),
    instances(six, empreinte, vis),
    instances(palier, usine, paliers),
    instances(moyeu, usine, paliers),
    instances(boulon, noirci, boulons),
    instances(ecrou, usine, ecrous),
    instances(rainure, joint, rainures, false),
    instances(rainure, joint, grilles, false),
    instances(barre, brosse, poignees, false),
    instances(pied, brosse, pieds),
    instances(boitier, jaune, boitiers, false),
    instances(collerette, jaune, arrets),
    instances(tige, rouge, arrets),
    instances(champignon, rouge, arrets),
  ];
  const geoPicto = quads(pictos);
  const geoNum = quads(plaquesNum);
  const mPicto = new THREE.Mesh(geoPicto, picto);
  const mNum = new THREE.Mesh(geoNum, numero);
  for (const m of [mPicto, mNum]) m.receiveShadow = true;
  objets.push(mPicto, mNum);
  return {
    objets,
    materiaux,
    jetables: [tete, six, palier, moyeu, boulon, ecrou, rainure, barre, pied, boitier, collerette, champignon, tige, geoPicto, geoNum, texPicto, texNum, ...materiaux],
  };
}

export function DetailsPresse({ url, estompe }: Props) {
  const { scene } = useGLTF(url);
  const jeu = useMemo(() => construire(scene), [scene]);
  useEffect(() => () => jeu.jetables.forEach((j) => j.dispose()), [jeu]);
  // Estompées en fondu avec la presse (même durée que MachineModel), transparentes seulement le temps qu'il faut.
  const niveau = useRef(0);
  // Dernière opacité demandée : le fondu de retour repart d'elle, même quand `estompe` est déjà revenu à null.
  const voileVise = useRef(1);
  useEffect(() => {
    if (estompe !== null) voileVise.current = estompe;
  }, [estompe]);
  useFrame((_, dt) => {
    const cible = estompe === null ? 0 : 1;
    if (niveau.current === cible) return;
    niveau.current = cible > niveau.current ? Math.min(1, niveau.current + dt / FONDU_S) : Math.max(0, niveau.current - dt / FONDU_S);
    const voile = niveau.current > 0;
    for (const m of jeu.materiaux) {
      if (m.transparent !== voile) {
        m.transparent = voile;
        m.depthWrite = !voile;
        m.needsUpdate = true;
      }
      m.opacity = 1 + (voileVise.current - 1) * niveau.current;
    }
  });
  return (
    <group>
      {jeu.objets.map((o) => (
        <primitive key={o.uuid} object={o} />
      ))}
    </group>
  );
}
