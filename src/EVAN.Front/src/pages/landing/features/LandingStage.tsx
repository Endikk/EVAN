/**
 * Scène 3D de l'accueil : la presse flexo du kit (la plus grande machine du parc), le vrai produit.
 * Chaque puce « Voir sur la presse » déplace la caméra et change l'état de la machine :
 * panne de la dorure à froid, automate, repères du kit, vue de dessus cotée.
 * Chargée à la demande : Three.js ne pèse pas sur le premier affichage. Volet ouvert par-dessus, plus aucune image
 * n'est dessinée. Pendant le film d'ouverture, la caméra, la lumière, la vitesse et l'état de la presse suivent
 * l'horloge du film (../film/).
 */
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Html, Line, useGLTF } from '@react-three/drei';
import { MachineModel, type OrganFocus } from '@/widgets/scene/MachineModel';
import type { Horloge } from '../film/horloge';
import type { Phase } from '../film/timeline';
import { frontScan, planifier, poseDuFilm, projeter, type Sujets } from '../film/camera';
import type { EtatMachine } from '@/domain/types';
import { CODE_PANNE, PRESSE, PRESSE_DIM, VERIF_DORURE, nomCourt, type VueId } from '../lib/sections';
import { EcransPresse } from './EcransPresse';
import { EclairagePresse, REGLAGE_REPOS, type Reglage } from './EclairagePresse';
import { bande, centrer, hauteur, largeur, type Cadrage, type Pt, type Rect } from '../lib/cadrage';
import { Studio, usePrecompiler } from '../realisme/Studio';
import { DetailsPresse } from '../realisme/DetailsPresse';
import { HABILLAGE_PRESSE } from '../realisme/matieres';

/**
 * Ce que la presse doit respecter, en pixels de la toile : la zone où elle tient entière (hors ticket) et les
 * rectangles qu'elle ne recouvre pas (le texte, la carte de la machine). Nul tant que la page ne l'a pas mesuré.
 */
export interface Cadre {
  libre: Rect;
  eviter: Rect[];
}

interface Props {
  vue: VueId;
  cadre: Cadre | null;
  dark: boolean;
  reduced: boolean;
  /** Faux quand la presse est cachée (volet ouvert par-dessus) : la boucle de rendu s'arrête. */
  actif: boolean;
  onReady(): void;
  /** Film d'ouverture en cours, et sa phase (la presse casse, la pièce s'allume). */
  film?: Horloge | null;
  phaseFilm?: Phase;
}

/** Couleurs de la scène lues dans les jetons du thème (styles/jetons.css), pour que la 3D suive le jour et la nuit. */
function jeton(nom: string, secours: string): string {
  if (typeof document === 'undefined') return secours;
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim() || secours;
}

const D2R = Math.PI / 180;
const MODEL_URL = PRESSE.modele;
useGLTF.preload(MODEL_URL);

/** Opacité du reste de la presse quand un organe est ciblé. */
const GHOST = 0.5;

/** Centre de l'emprise : le modèle est recentré sur l'origine. */
const OFFSET: [number, number, number] = [0.075, 0, -0.15];
const HALF = { x: PRESSE_DIM.w / 2, z: PRESSE_DIM.d / 2 };

const organ = (n: number): [number, number, number] => {
  const p = PRESSE.organes.find((o) => o.numero === n)?.position ?? [0, 1, 0];
  return [p[0] + OFFSET[0], p[1], p[2] + OFFSET[2]];
};
const DORURE = organ(5);

/**
 * Ce que le film regarde : le moyeu du dernier rouleau (rembobineur, organe 8 ; nœud rotatif_54 du modèle, centré en
 * (3,22 ; 1 ; 0), 0,44 m de large), où le point d'état se pose, et la dorure à froid, où il court quand elle casse.
 */
const SUJETS: Sujets = {
  rouleau: [3.22 + OFFSET[0], 1, 0.22 + OFFSET[2]],
};

/**
 * Repères des pièces surveillées, numéro et nom court. Pris de gauche à droite, ils alternent entre trois hauteurs :
 * deux pièces voisines (groupe flexo et encrage) ne se chevauchent pas.
 */
const MARQUES = PRESSE.organes
  .filter((o) => o.position)
  .sort((a, b) => (a.position?.[0] ?? 0) - (b.position?.[0] ?? 0))
  .map((o, i) => ({ numero: o.numero, nom: nomCourt(o.nom), pied: organ(o.numero), haut: 2.2 + (i % 3) * 0.34 }));

/** Boîte à garder entière à l'écran, en mètres, dans le repère de la presse recentrée. */
interface Boite {
  x: [number, number];
  y: [number, number];
  z: [number, number];
}

interface View {
  target: [number, number, number];
  az: number;
  el: number;
  /** Vue rapprochée : largeur et hauteur de scène (m) visibles dans la zone libre. Sinon, la presse entière. */
  champ?: [number, number];
  /** Ce qui doit rester entier à l'écran quand la presse est vue en entier. */
  boite?: Boite;
  top?: boolean;
}

const PRESSE_ENTIERE: Boite = { x: [-HALF.x, HALF.x], y: [0, 2.15], z: [-HALF.z, HALF.z] };

const VIEWS: Record<VueId, View> = {
  accueil: { target: [0, 0.8, 0], az: 24, el: 15, boite: PRESSE_ENTIERE },
  panne: { target: [DORURE[0] - 0.4, DORURE[1] - 0.45, DORURE[2]], az: 18, el: 14, champ: [3.6, 2.4] },
  // Vue de dessus : la boîte s'élargit côté cotes, pour garder leurs étiquettes à l'écran.
  // Les repères numérotés montent jusqu'à 2,7 m : la boîte monte avec eux.
  pieces: { target: [0, 1.35, 0], az: -20, el: 11, boite: { ...PRESSE_ENTIERE, y: [0, 2.95] } },
};

const STATE: Record<VueId, { etat: EtatMachine; facteur: number; focus?: OrganFocus }> = {
  accueil: { etat: 'marche', facteur: 1 },
  panne: { etat: 'panne', facteur: 0, focus: { numero: 5, kind: 'defaut' } },
  pieces: { etat: 'marche', facteur: 1 },
};

/** Arc des grands changements de vue : la caméra monte de quelques degrés et recule un peu au milieu du trajet. */
const ARC_EL = 6;
const ARC_DIST = 0.08;
/** Amplitude du léger mouvement de caméra (pointeur et balancement lent), en degrés. */
const BALANCE_AZ = 4.5;
const BALANCE_EL = 1.5;
/** Bornes de la recherche de distance : assez près pour remplir un grand écran, jamais dans la machine. */
const DIST_MIN = 7;
/**
 * Toile étroite (px) ou presque carrée (largeur sur hauteur) : la presse est vue plus de biais, de ces angles en plus.
 */
const TOILE_ETROITE = 640;
const TOILE_CARREE = 1.4;
const BIAIS_AZ = 28;
const BIAIS_EL = 8;
const DIST_MAX = 90;
const HORS_CHAMP: Pt[] = [
  [-1e6, -1e6],
  [1e6, 1e6],
];

/**
 * Projette les coins de la boîte de la vue sur la toile, pour une distance donnée, dans toutes les poses que le
 * balancement de la caméra peut prendre : la presse reste entière même au bout du mouvement.
 */
function projeteur(view: View, az: number, el: number, w: number, h: number, fov: number, balance: boolean) {
  const b = view.boite ?? PRESSE_ENTIERE;
  const coins = b.x.flatMap((x) => b.y.flatMap((y) => b.z.map((z) => new THREE.Vector3(x, y, z))));
  const poses: [number, number][] = [[az, el]];
  if (balance) {
    for (const sa of [-1, 1]) for (const se of [-1, 1]) poses.push([az + sa * BALANCE_AZ, el + se * BALANCE_EL]);
  }
  const cam = new THREE.PerspectiveCamera(fov, w / h, 0.1, 200);
  const cible = new THREE.Vector3(...view.target);
  const p = new THREE.Vector3();
  return (d: number): Pt[] => {
    const pts: Pt[] = [];
    for (const [a, e] of poses) {
      const aa = a * D2R;
      const ea = e * D2R;
      cam.position.set(Math.sin(aa) * Math.cos(ea), Math.sin(ea), Math.cos(aa) * Math.cos(ea)).multiplyScalar(d).add(cible);
      cam.lookAt(cible);
      cam.updateMatrixWorld();
      for (const c of coins) {
        p.copy(c).project(cam);
        // Un coin derrière la caméra se projette n'importe où : la distance est refusée.
        if (p.z < -1 || p.z > 1) return HORS_CHAMP;
        pts.push([((p.x + 1) / 2) * w, ((1 - p.y) / 2) * h]);
      }
    }
    return pts;
  };
}

/**
 * Distance et décalage visés pour une vue. La presse est toujours au centre de l'écran, dans la bande au-dessus des
 * blocs du bas : entière et la plus grande possible, ou l'organe montré au centre, de près.
 */
function viser(view: View, az: number, el: number, w: number, h: number, fov: number, cadre: Cadre | null, balance: boolean): Cadrage {
  const libre = cadre?.libre ?? { x0: 0, y0: 0, x1: w, y1: h };
  const eviter = cadre?.eviter ?? [];
  const zone = bande(libre, eviter);
  if (view.champ) {
    const tanV = Math.tan((fov * D2R) / 2);
    const dist = Math.max((view.champ[0] * h) / (2 * tanV * Math.max(1, largeur(zone))), (view.champ[1] * h) / (2 * tanV * Math.max(1, hauteur(zone))));
    return { dist, ox: w / 2 - (zone.x0 + zone.x1) / 2, oy: h / 2 - (zone.y0 + zone.y1) / 2 };
  }
  return centrer(projeteur(view, az, el, w, h, fov, balance), zone, eviter, DIST_MIN, DIST_MAX);
}

/** Pose de la caméra autour de sa cible, et décalage de l'image. */
interface PoseCamera {
  az: number;
  el: number;
  dist: number;
  tx: number;
  ty: number;
  tz: number;
  ox: number;
  oy: number;
}

/** Entrée et sortie lentes, accélération au milieu : le mouvement d'une grue de tournage. */
const adoucir = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const melange = (a: number, b: number, k: number) => a + (b - a) * k;

/**
 * Durée d'un changement de vue (s) : plus le trajet est long (angle, distance), plus il prend son temps, sans jamais
 * traîner.
 */
function dureeTrajet(a: PoseCamera, b: PoseCamera): number {
  const ecart = Math.abs(b.az - a.az) * 0.008 + Math.abs(b.el - a.el) * 0.01 + Math.abs(Math.log(b.dist / a.dist)) * 0.45;
  return 0.95 + Math.min(0.9, ecart);
}

/**
 * Caméra : interpolation douce vers la vue de la puce, léger suivi du pointeur. Le cadrage n'est recalculé que si la
 * vue, la taille de la toile ou les obstacles changent, jamais à chaque image.
 */
function Rig({ vue, cadre, reduced, film }: { vue: VueId; cadre: Cadre | null; reduced: boolean; film: Horloge | null }) {
  const { camera, size } = useThree();
  const fov = (camera as THREE.PerspectiveCamera).fov;
  const view = VIEWS[vue];
  const balance = !reduced && !view.top;
  // Toile étroite ou en portrait : la presse est vue plus de biais et d'un peu plus haut. Plus ramassée, elle
  // remplit la hauteur au lieu de n'être qu'un trait sur la largeur.
  const biais = (size.width < size.height * TOILE_CARREE || size.width < TOILE_ETROITE) && !view.top && !view.champ;
  const az = view.az + (biais ? BIAIS_AZ * Math.sign(view.az || 1) : 0);
  const el = view.el + (biais ? BIAIS_EL : 0);
  const but = useMemo(() => viser(view, az, el, size.width, size.height, fov, cadre, balance), [view, az, el, size.width, size.height, fov, cadre, balance]);
  const cur = useRef<PoseCamera>({ az, el, dist: but.dist, tx: view.target[0], ty: view.target[1], tz: view.target[2], ox: but.ox, oy: but.oy });
  const first = useRef(true);
  // Trajet en cours vers une nouvelle vue : la pose de départ, et l'heure de départ (fixée à la première image).
  const anim = useRef<{ de: PoseCamera; t0: number | null; duree: number } | null>(null);
  const vuePrecedente = useRef(vue);
  useEffect(() => {
    if (vuePrecedente.current === vue) return;
    vuePrecedente.current = vue;
    anim.current = reduced || first.current ? null : { de: { ...cur.current }, t0: null, duree: 1 };
  }, [vue, reduced]);
  // Fin du film : le balancement habituel de la caméra repart de zéro, en deux secondes, au lieu de démarrer d'un coup.
  const finFilm = useRef<number | null>(null);
  const v = useMemo(() => new THREE.Vector3(), []);
  // Film : la vue de repos et les places à l'écran du rouleau et de la dorure, pour les épingler.
  const plan = useMemo(
    () => (film ? planifier({ cible: view.target, az, el, dist: but.dist, ox: but.ox, oy: but.oy }, SUJETS, size.width, size.height, fov) : null),
    [film, view, az, el, but, size.width, size.height, fov],
  );
  useEffect(() => {
    if (film && plan) film.ancres.rouleau = plan.rouleauEcran;
  }, [film, plan]);

  useFrame((state, dt) => {
    const cam = camera as THREE.PerspectiveCamera;
    if (film && plan && film.phase() !== 'fin') {
      const k = film.canaux();
      const p = poseDuFilm(cam, k, plan, SUJETS, size.width, size.height);
      // La caméra habituelle repartira de cette pose, sans saut, quand le film rendra la main.
      Object.assign(cur.current, { az: p.az, el: p.el, dist: p.dist, tx: p.cible[0], ty: p.cible[1], tz: p.cible[2], ox: p.ox, oy: p.oy });
      first.current = false;
      film.ancres.point = projeter(cam, SUJETS.rouleau, size.width, size.height);
      finFilm.current = state.clock.elapsedTime;
      return;
    }
    const t = state.clock.elapsedTime;
    let a = az;
    let e = el;
    if (balance) {
      const reprise = finFilm.current === null ? 1 : Math.min(1, (t - finFilm.current) / 2);
      a += (state.pointer.x * 3 + Math.sin(t * 0.25) * (BALANCE_AZ - 3)) * reprise;
      e += state.pointer.y * -BALANCE_EL * reprise;
    }
    const c = cur.current;
    const vise: PoseCamera = { az: a, el: e, dist: but.dist, tx: view.target[0], ty: view.target[1], tz: view.target[2], ox: but.ox, oy: but.oy };
    const trajet = anim.current;
    if (trajet) {
      // Changement de vue : un seul mouvement minuté, comme dans le film, qui rejoint la cible même si elle bouge
      // (balancement, fenêtre redimensionnée). Les grands trajets montent un peu en arc, comme une grue.
      if (trajet.t0 === null) {
        trajet.t0 = t;
        trajet.duree = dureeTrajet(trajet.de, vise);
      }
      const k = Math.min(1, (t - trajet.t0) / trajet.duree);
      const p = adoucir(k);
      const de = trajet.de;
      const ampleur = Math.min(1, Math.abs(vise.az - de.az) / 40 + Math.abs(Math.log(vise.dist / de.dist)));
      const arc = Math.sin(Math.PI * p) * ampleur;
      c.az = melange(de.az, vise.az, p);
      c.el = melange(de.el, vise.el, p) + ARC_EL * arc;
      c.dist = de.dist * Math.pow(vise.dist / de.dist, p) * (1 + ARC_DIST * arc);
      c.tx = melange(de.tx, vise.tx, p);
      c.ty = melange(de.ty, vise.ty, p);
      c.tz = melange(de.tz, vise.tz, p);
      c.ox = melange(de.ox, vise.ox, p);
      c.oy = melange(de.oy, vise.oy, p);
      if (k >= 1) anim.current = null;
    } else {
      const k = first.current || reduced ? 1 : 1 - Math.exp(-dt * 2.6);
      c.az += (vise.az - c.az) * k;
      c.el += (vise.el - c.el) * k;
      c.dist += (vise.dist - c.dist) * k;
      c.tx += (vise.tx - c.tx) * k;
      c.ty += (vise.ty - c.ty) * k;
      c.tz += (vise.tz - c.tz) * k;
      c.ox += (vise.ox - c.ox) * k;
      c.oy += (vise.oy - c.oy) * k;
    }
    first.current = false;

    const ea = c.el * D2R;
    const aa = c.az * D2R;
    v.set(Math.sin(aa) * Math.cos(ea), Math.sin(ea), Math.cos(aa) * Math.cos(ea)).multiplyScalar(c.dist);
    cam.position.set(c.tx + v.x, c.ty + v.y, c.tz + v.z);
    cam.lookAt(c.tx, c.ty, c.tz);
    cam.setViewOffset(size.width, size.height, c.ox, c.oy, size.width, size.height);
  });
  return null;
}

/**
 * Signale que la presse est prête (même Suspense que le modèle) : ses shaders compilés d'avance (realisme/Studio.tsx),
 * puis ses trois premières images dessinées. En relecture, rien ne se dessine seul : la compilation suffit.
 */
function Ready({ onReady, immediat }: { onReady(): void; immediat: boolean }) {
  const images = useRef(0);
  const compile = useRef(false);
  const precompiler = usePrecompiler();
  useEffect(() => {
    let vivant = true;
    // Même en cas d'échec de la compilation d'avance, la presse finit par se signaler : les shaders se compileront au vol.
    precompiler()
      .catch(() => undefined)
      .then(() => {
        if (!vivant) return;
        compile.current = true;
        if (immediat) onReady();
      });
    return () => {
      vivant = false;
    };
  }, [precompiler, onReady, immediat]);
  useFrame(() => {
    if (compile.current && ++images.current === 3 && !immediat) onReady();
  });
  return null;
}

/** Point lumineux pulsant sur un organe. */
function Beacon({ position, color, reduced }: { position: [number, number, number]; color: string; reduced: boolean }) {
  const ring = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ring.current) return;
    const k = reduced ? 0.5 : (state.clock.elapsedTime % 1.2) / 1.2;
    ring.current.scale.setScalar(0.6 + k * 1.3);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = reduced ? 0.8 : 0.9 * (1 - k);
    ring.current.quaternion.copy(state.camera.quaternion);
  });
  return (
    <group position={position}>
      <mesh renderOrder={10}>
        <sphereGeometry args={[0.045, 16, 16]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <mesh ref={ring} renderOrder={10}>
        <torusGeometry args={[0.2, 0.014, 10, 48]} />
        <meshBasicMaterial color={color} transparent depthTest={false} />
      </mesh>
    </group>
  );
}

/** Étiquette HTML ancrée dans la scène. */
function Pin({ position, tone, children, delay = 0 }: { position: [number, number, number]; tone: 'crit' | 'accent' | 'piece'; children: ReactNode; delay?: number }) {
  return (
    <Html position={position} center zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`lp-pin tone-${tone}`} style={{ animationDelay: `${delay}ms` }}>
        {children}
      </div>
    </Html>
  );
}

/** Durée de la montée du trait d'un repère (s). */
const MONTEE = 0.42;

/**
 * Repère posé sur la presse : un point sur la pièce, un trait qui monte à la verticale, puis l'étiquette au bout du
 * trait. Le trait pousse depuis la pièce, l'étiquette arrive quand il touche son point haut : l'œil suit de la pièce
 * au nom.
 */
function Repere({
  pied,
  hauteur: h,
  delai = 0,
  couleur,
  trait,
  ton,
  reduced,
  children,
}: {
  pied: [number, number, number];
  hauteur: number;
  delai?: number;
  couleur: string;
  trait: string;
  ton: 'crit' | 'accent' | 'piece';
  reduced: boolean;
  children: ReactNode;
}) {
  const tige = useRef<THREE.Group>(null);
  const t0 = useRef<number | null>(null);
  useFrame((state) => {
    if (!tige.current) return;
    if (t0.current === null) t0.current = state.clock.elapsedTime;
    const k = reduced ? 1 : Math.min(1, Math.max(0, (state.clock.elapsedTime - t0.current - delai / 1000) / MONTEE));
    tige.current.scale.y = Math.max(1e-4, 1 - Math.pow(1 - k, 3));
  });
  return (
    <group position={pied}>
      <mesh renderOrder={10}>
        <sphereGeometry args={[0.035, 14, 14]} />
        <meshBasicMaterial color={couleur} depthTest={false} transparent />
      </mesh>
      <group ref={tige} scale={[1, reduced ? 1 : 1e-4, 1]}>
        <Line
          points={[
            [0, 0.05, 0],
            [0, h - 0.12, 0],
          ]}
          color={trait}
          lineWidth={1.2}
          transparent
          opacity={0.75}
          depthTest={false}
        />
      </group>
      <Pin position={[0, h, 0]} tone={ton} delay={reduced ? 0 : delai + MONTEE * 800}>
        {children}
      </Pin>
    </group>
  );
}


/** En relecture image par image, l'horloge du film fait dessiner la scène à l'instant demandé. */
function BrancheFilm({ film }: { film: Horloge | null }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    if (!film || film.mode !== 'capture') return;
    film.brancher3D((t) => advance(t, true));
    return () => film.brancher3D(null);
  }, [film, advance]);
  return null;
}

function Scene({ vue, cadre, dark, reduced, onReady, film = null, phaseFilm = 'fin' }: Omit<Props, 'actif'>) {
  // Film : la presse tourne ; la lumière du film la balaie et l'allume (EclairagePresse).
  const st = film ? { ...STATE.accueil, focus: undefined } : STATE[vue];
  const facteur = film ? () => film.canaux().facteur : st.facteur;
  const etat = st.etat;
  const ecrans = film
    ? () => ({ facteur: film.canaux().facteur, panne: false, passe: (k: number) => film.canauxA(film.image() - k).facteur })
    : () => ({ facteur: st.facteur, panne: st.etat === 'panne', passe: () => st.facteur });
  const presse = useRef<THREE.Group>(null);
  const eclairage = (): Reglage => {
    if (!film) return REGLAGE_REPOS;
    const k = film.canaux();
    return {
      ...REGLAGE_REPOS,
      // Pendant le travelling, la rampe de lumière suit la caméra ; arrivée au dernier rouleau, tout est allumé.
      front: k.allumee ? 100 : frontScan(k.travelling),
      bord: k.allumee ? 0 : 1,
      eteinte: 0,
      fondCouleur: c.fond,
    };
  };
  // Les jetons changent avec le thème : on les relit à chaque bascule jour / nuit.
  const c = useMemo(
    () => ({
      crit: jeton('--crit', '#ff3d6e'),
      fond: jeton('--bg', '#040812'),
      braise: jeton('--accent-2', '#ff7a3d'),
      texte: jeton('--text', '#eef2f8'),
    }),
    // `dark` ne sert pas au calcul : il signale que les jetons du document viennent de changer.
    [dark],
  );
  return (
    <>
      <Rig vue={vue} cadre={cadre} reduced={reduced} film={film} />
      <BrancheFilm film={film} />
      <Studio dark={dark} film={!!film && film.mode !== 'capture'}>
        <Suspense fallback={null}>
          <group ref={presse} position={OFFSET}>
            <MachineModel
              url={MODEL_URL}
              etat={etat}
              facteur={facteur}
              focus={st.focus}
              reduced={reduced}
              ghost={GHOST}
              habillage={HABILLAGE_PRESSE}
            />
            <DetailsPresse url={MODEL_URL} estompe={st.focus ? GHOST : null} />
          </group>
          <Ready onReady={onReady} immediat={film?.mode === 'capture'} />
          {film && <EclairagePresse presse={presse} piece={DORURE} rayon={0.2} alerte={c.crit} reglage={eclairage} />}
          <EcransPresse etat={ecrans} amorti={!film} />

          {vue === 'panne' && (
            <>
              <Beacon position={DORURE} color={c.crit} reduced={reduced} />
              <Repere pied={DORURE} hauteur={0.5} delai={650} couleur={c.crit} trait={c.crit} ton="crit" reduced={reduced}>
                <b>{CODE_PANNE}</b> Dorure à froid
                <small>{VERIF_DORURE}</small>
              </Repere>
            </>
          )}
          {vue === 'pieces' &&
            MARQUES.map((m, i) => (
              <Repere
                key={m.numero}
                pied={m.pied}
                hauteur={m.haut - m.pied[1]}
                delai={300 + i * 70}
                couleur={c.braise}
                trait={c.texte}
                ton="piece"
                reduced={reduced}
              >
                <b>{String(m.numero).padStart(2, '0')}</b> {m.nom}
              </Repere>
            ))}
          {/* Ombre de contact calculée une fois, machine chargée : la presse ne se déplace pas, inutile de la redessiner à chaque image. */}
          <ContactShadows
            position={[0, 0.002, 0]}
            scale={[14, 6]}
            resolution={512}
            blur={2.4}
            far={2.2}
            frames={1}
            // Avant que la presse s'allume, pas d'ombre sous une machine encore invisible.
            opacity={film && phaseFilm === 'travelling' ? 0 : dark ? 0.6 : 0.32}
            color={dark ? '#000000' : '#26241f'}
          />
        </Suspense>
      </Studio>
    </>
  );
}

export default function LandingStage({ actif, ...props }: Props) {
  const capture = props.film?.mode === 'capture';
  return (
    <Canvas
      // Densité plafonnée à 1,5 : la toile couvre une grande part de l'écran, le 2× d'un écran Retina ferait ramer.
      dpr={[1, 1.5]}
      frameloop={actif && !capture ? 'always' : 'never'}
      // Anticrénelage, courbe de tons et sRGB sont faits par le rendu du studio (realisme/Studio.tsx).
      gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
      shadows="percentage"
      camera={{ fov: 22, near: 0.1, far: 200, position: [4, 3, 14] }}
      style={{ touchAction: 'pan-y' }}
      aria-label={`Modèle 3D animé de la ${PRESSE.nomKit}`}
    >
      <Scene {...props} />
    </Canvas>
  );
}
