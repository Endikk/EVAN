/**
 * Éclairage de la presse pendant le film d'ouverture, posé dans ses shaders : la presse peut être éteinte (fondue dans
 * le fond de la page, par son alpha) puis apparaître de proche en proche depuis le dernier rouleau (un front large qui
 * balaie la machine selon x), et, pendant la panne, s'assombrir autour de la pièce en cause, seule sous le projecteur,
 * teintée du rouge d'alerte.
 *
 * Chaque matériau de la presse reçoit le même petit ajout en fin de fragment (une multiplication de la couleur) :
 * hors film, les réglages valent l'identité et l'image est celle de toujours.
 */
import { useLayoutEffect, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export interface Reglage {
  /** Front d'allumage selon x (m) : allumé du côté des x plus petits (le dérouleur). Très grand : tout est allumé. */
  front: number;
  /** Éclat du front, la rampe de lumière qui passe (0 à 1). */
  bord: number;
  /** Présence de la presse éteinte (0 : fondue dans le fond de la page, 1 : visible). */
  eteinte: number;
  /** Projecteur sur la pièce : 0 sans effet, 1 le reste de la presse à `fond`. */
  force: number;
  fond: number;
  /** Le reste de la presse pâlit vers la couleur du fond (thème clair) au lieu de s'assombrir (thème nuit). */
  fondPresence: boolean;
  /** Couleur du fond de la page (jeton --bg), vers laquelle la presse pâlit de jour. */
  fondCouleur: string;
  /** Force de la teinte d'alerte sur la pièce (0 à 1). */
  teinte: number;
}

/** Réglage neutre : la presse telle qu'elle est hors du film. */
export const REGLAGE_REPOS: Reglage = { front: 100, bord: 0, eteinte: 1, force: 0, fond: 1, fondPresence: false, fondCouleur: '#ffffff', teinte: 0 };

interface Props {
  /** Le groupe qui contient la presse. */
  presse: RefObject<THREE.Group | null>;
  /** Pièce en cause : centre dans le repère de la scène, et rayon de ce qui lui appartient (m). */
  piece: [number, number, number];
  rayon: number;
  /** Couleur d'alerte (jeton --crit). */
  alerte: string;
  /** Lu à chaque image. */
  reglage(): Reglage;
}

/** Rayon du projecteur autour de la pièce (m). */
const SPOT = 0.75;
/** Au-delà de cette diagonale (m), une pièce est un volume de structure (socle, bâti) : jamais la pièce en cause. */
const STRUCTURE = 3.5;

const VERTEX_DECL = 'varying vec3 vEvanMonde;\n';
// Les détails ajoutés à la presse (vis, paliers) sont des maillages instanciés : leur position passe par instanceMatrix.
const VERTEX_FIN = `
  #ifdef USE_INSTANCING
    vEvanMonde = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vEvanMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif`;
const FRAGMENT_DECL = `varying vec3 vEvanMonde;
uniform float uEvanFront;
uniform float uEvanBord;
uniform float uEvanEteinte;
uniform vec4 uEvanSpot;
uniform float uEvanForce;
uniform float uEvanFond;
uniform float uEvanFondPresence;
uniform vec3 uEvanFondCouleur;
uniform vec3 uEvanTeinte;
uniform float uEvanTeinteForce;
`;
// La couleur de sortie est déjà en sRGB à cet endroit : la teinte l'est aussi. La toile est composée sur la page en
// alpha prémultiplié : multiplier couleur et alpha par la présence fond la presse dans le fond, quel que soit le thème.
const FRAGMENT_FIN = `
  // Allumé derrière le front (côté dérouleur), éteint devant ; le front lui-même brille, comme une rampe qui passe.
  float evanAllume = 1.0 - smoothstep(uEvanFront - 0.5, uEvanFront + 0.15, vEvanMonde.x);
  float evanRampe = uEvanBord * exp(-pow((vEvanMonde.x - uEvanFront) / 0.22, 2.0));
  float evanPresence = mix(uEvanEteinte, 1.0, evanAllume);
  float evanSpot = 1.0 - smoothstep(uEvanSpot.w * 0.55, uEvanSpot.w, distance(vEvanMonde, uEvanSpot.xyz));
  float evanProjecteur = mix(1.0, mix(uEvanFond, 1.0, evanSpot), uEvanForce);
  // La nuit, le reste de la presse s'assombrit ; de jour, il pâlit vers la couleur du fond, en restant opaque.
  gl_FragColor.rgb = mix(gl_FragColor.rgb * evanProjecteur, mix(uEvanFondCouleur, gl_FragColor.rgb, evanProjecteur), uEvanFondPresence);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uEvanTeinte * (0.35 + 0.65 * max(gl_FragColor.r, max(gl_FragColor.g, gl_FragColor.b))), uEvanTeinteForce);
  gl_FragColor.rgb += vec3(1.0, 0.93, 0.82) * evanRampe * 0.9;
  gl_FragColor *= max(evanPresence, evanRampe);
`;

/**
 * Ajout et clé de shader d'un matériau avant le premier passage ici, gardés une fois pour toutes : un second montage
 * (le film rejoué) repart de là, au lieu d'empiler deux fois l'éclairage.
 */
const origines = new WeakMap<THREE.Material, { patch: THREE.Material['onBeforeCompile']; cle: string }>();
function origine(mat: THREE.Material) {
  let o = origines.get(mat);
  if (!o) {
    o = { patch: mat.onBeforeCompile, cle: mat.customProgramCacheKey() };
    origines.set(mat, o);
  }
  return o;
}

/** Composantes sRGB brutes d'une couleur CSS, sans conversion vers l'espace linéaire. */
function srgb(css: string): THREE.Vector3 {
  const c = new THREE.Color();
  c.setStyle(css, THREE.SRGBColorSpace);
  c.convertLinearToSRGB();
  return new THREE.Vector3(c.r, c.g, c.b);
}

export function EclairagePresse({ presse, piece, rayon, alerte, reglage }: Props) {
  const etat = useRef<{ partages: Record<string, THREE.IUniform>; propres: Map<THREE.Material, THREE.IUniform<number>>; touchees: Set<THREE.Material> } | null>(null);
  const teinteLue = useRef('');

  // Avant la première image : la presse ne doit jamais se montrer allumée avant son heure.
  useLayoutEffect(() => {
    const racine = presse.current;
    if (!racine) return;
    racine.updateMatrixWorld(true);
    const partages: Record<string, THREE.IUniform> = {
      uEvanFront: { value: 100 },
      uEvanBord: { value: 0 },
      uEvanEteinte: { value: 1 },
      uEvanSpot: { value: new THREE.Vector4(piece[0], piece[1], piece[2], SPOT) },
      uEvanForce: { value: 0 },
      uEvanFond: { value: 1 },
      uEvanFondPresence: { value: 0 },
      uEvanFondCouleur: { value: new THREE.Vector3(1, 1, 1) },
      uEvanTeinte: { value: new THREE.Vector3(1, 1, 1) },
    };
    const propres = new Map<THREE.Material, THREE.IUniform<number>>();
    const touchees = new Set<THREE.Material>();
    const centre = new THREE.Vector3(...piece);
    const boite = new THREE.Box3();
    const taille = new THREE.Vector3();
    racine.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      boite.setFromObject(mesh);
      const dePiece = !boite.isEmpty() && boite.getSize(taille).length() < STRUCTURE && boite.distanceToPoint(centre) <= rayon;
      for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        if (dePiece) touchees.add(mat);
        if (propres.has(mat)) continue;
        const force = { value: 0 };
        propres.set(mat, force);
        // Le matériau a peut-être déjà son propre ajout (le grain des matières) : il passe avant celui-ci.
        const avant = origine(mat);
        mat.onBeforeCompile = (shader, renderer) => {
          avant.patch.call(mat, shader, renderer);
          Object.assign(shader.uniforms, partages, { uEvanTeinteForce: force });
          shader.vertexShader = VERTEX_DECL + shader.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>${VERTEX_FIN}`);
          shader.fragmentShader = FRAGMENT_DECL + shader.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>${FRAGMENT_FIN}`);
        };
        mat.customProgramCacheKey = () => `${avant.cle}|evan-eclairage-presse`;
        mat.needsUpdate = true;
      }
    });
    etat.current = { partages, propres, touchees };
    teinteLue.current = '';
    return () => {
      // Le film terminé (ou passé), la presse retrouve sa lumière, quelle que soit l'image où il s'est arrêté. Le
      // patch reste sur les matériaux, réglé sur l'identité : le retirer recompilerait leurs shaders, et l'image
      // marquerait un temps juste à la fin du film.
      partages.uEvanFront.value = REGLAGE_REPOS.front;
      partages.uEvanBord.value = 0;
      partages.uEvanEteinte.value = REGLAGE_REPOS.eteinte;
      partages.uEvanForce.value = REGLAGE_REPOS.force;
      for (const force of propres.values()) force.value = 0;
      etat.current = null;
    };
  // Patché une fois : three garde le programme compilé (même clé de cache) et ne rappellerait pas onBeforeCompile ;
  // ce qui change ensuite (la couleur d'alerte au passage jour / nuit) passe par la valeur des uniformes.
  }, [presse, piece, rayon]);

  useFrame(() => {
    const e = etat.current;
    if (!e) return;
    const r = reglage();
    const p = e.partages;
    p.uEvanFront.value = r.front;
    p.uEvanBord.value = r.bord;
    p.uEvanEteinte.value = r.eteinte;
    p.uEvanForce.value = r.force;
    p.uEvanFond.value = r.fond;
    if (teinteLue.current !== alerte + r.fondCouleur) {
      teinteLue.current = alerte + r.fondCouleur;
      (p.uEvanTeinte.value as THREE.Vector3).copy(srgb(alerte));
      (p.uEvanFondCouleur.value as THREE.Vector3).copy(srgb(r.fondCouleur));
    }
    p.uEvanFondPresence.value = r.fondPresence ? 1 : 0;
    for (const [mat, force] of e.propres) force.value = e.touchees.has(mat) ? r.teinte : 0;
  });
  return null;
}
