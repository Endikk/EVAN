/**
 * Nuage de pixels rouge EVAN, en fond : un champ de bruit tramé (trame de Bayer 8 × 8) dessiné par un petit
 * shader, qui dérive lentement depuis un coin. Pure décoration : il ne capte aucun clic et n'est pas lu.
 *
 * Coût maîtrisé : toile à 1 pixel CSS par pixel pour les carrés (gros, `image-rendering: pixelated` les garde nets), à
 * la densité de l'écran pour la trame et les ondes (motifs lissés), 24 images par seconde au plus, arrêt hors écran,
 * onglet caché ou animations réduites (une seule image figée).
 * Sans WebGL, rien ne s'affiche.
 */
import { useEffect, useRef, useState } from 'react';
import { useIsDark, useReducedMotion } from '@/store/ui';

export type PixelPlacement = 'bas-droite' | 'bas-gauche' | 'haut-droite' | 'hero';

/**
 * Le nuage est un ruban : il part d'une ancre (coordonnées de 0 à 1 dans la toile, y vers le haut), suit une pente en
 * ondulant, s'élargit et s'effiloche. Longueur et épaisseur en hauteurs de toile.
 */
const ANCRES: Record<PixelPlacement, { ancre: [number, number]; longueur: number; epaisseur: number; pente: number }> = {
  'bas-droite': { ancre: [1.0, 0.02], longueur: 1.5, epaisseur: 0.2, pente: -0.55 },
  'bas-gauche': { ancre: [0.0, 0.08], longueur: 1.3, epaisseur: 0.3, pente: 0.45 },
  'haut-droite': { ancre: [1.0, 0.5], longueur: 2.4, epaisseur: 0.3, pente: 0.1 },
  hero: { ancre: [1.0, 0.04], longueur: 1.35, epaisseur: 0.2, pente: -0.75 },
};

/** Rampe de couleur du plus diffus au plus dense : braise sombre, rouge EVAN, orange, cœur clair. */
const RAMPE_NUIT = ['#3d0f02', '#9a2a02', '#e2470f', '#ffb38a'];
const RAMPE_JOUR = ['#ffd8c4', '#ff9d6b', '#e2470f', '#9a2a02'];

const FPS = 24;

const VERTEX = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

/**
 * Plusieurs motifs pour un même ruban :
 * - `pixels` : les carrés tramés de la marque ;
 * - `trame` : la trame de demi-teinte d'une impression flexo, des points à 45° plus gros là où le ruban est dense ;
 * - `lignes` : une trame en lignes, dont le trait s'épaissit avec la densité, comme une gravure ;
 * - `rosette` : deux trames de points à 15° et 75°, en deux encres, qui forment la rosette d'une impression couleur ;
 * - `stochastique` : la trame aléatoire des presses récentes, des points fins semés d'autant plus serrés que c'est dense ;
 * - `ondes` : des lignes fines qui suivent le ruban, s'écartent et se resserrent avec lui ;
 * - `vagues` : des vagues pleines, en plis doux, sans trame ;
 * - `anilox` : les alvéoles hexagonales du rouleau anilox, qui dose l'encre d'un groupe flexo, plus pleines où c'est dense ;
 * - `croix` : des croix de repérage, plus grandes là où le ruban passe ;
 * - `codebarres` : des barres verticales de largeurs variées, découpées par le ruban ;
 * - `spires` : les spires d'une bobine vue de côté, centrées sur le coin d'où part le ruban ;
 * - `etiquettes` : des étiquettes sur leur support, contour seul au bord du ruban, pleines au cœur ;
 * - `moire` : deux trames de lignes presque parallèles, dont la superposition fait naître des franges.
 */
export type PixelMotif =
  | 'pixels'
  | 'trame'
  | 'lignes'
  | 'rosette'
  | 'stochastique'
  | 'ondes'
  | 'vagues'
  | 'anilox'
  | 'croix'
  | 'codebarres'
  | 'spires'
  | 'etiquettes'
  | 'moire';
const MOTIFS: Record<PixelMotif, number> = {
  pixels: 0,
  trame: 1,
  ondes: 2,
  lignes: 3,
  rosette: 4,
  stochastique: 5,
  vagues: 6,
  anilox: 7,
  croix: 8,
  codebarres: 9,
  spires: 10,
  etiquettes: 11,
  moire: 12,
};

function fragment(motif: PixelMotif) {
  return `${motif === 'ondes' ? '#extension GL_OES_standard_derivatives : enable\n' : ''}precision ${motif === 'pixels' ? 'mediump' : 'highp'} float;
#define MOTIF ${MOTIFS[motif]}
// Les motifs lissés calculent leur champ à chaque pixel : trois octaves suffisent, les carrés en gardent cinq.
#define OCTAVES ${motif === 'pixels' ? 5 : 3}
uniform vec2 uRes;
uniform float uTime;
uniform float uCell;
uniform float uDpr;
uniform vec2 uAncre;
uniform float uLongueur;
uniform float uEpaisseur;
uniform float uPente;
uniform float uIntensite;
uniform vec3 c0; uniform vec3 c1; uniform vec3 c2; uniform vec3 c3;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < OCTAVES; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float bayer2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a){ return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a){ return bayer4(0.5 * a) * 0.25 + bayer2(a); }

vec3 rampe(float d){
  return d < 0.35 ? mix(c0, c1, d / 0.35) : d < 0.7 ? mix(c1, c2, (d - 0.35) / 0.35) : mix(c2, c3, (d - 0.7) / 0.3);
}

// Ruban : une ligne de pente uPente qui ondule, d'épaisseur variable, qui s'éteint en s'éloignant de l'ancre.
// Renvoie l'écart au milieu du ruban, sa demi-largeur locale et l'extinction le long du ruban.
vec3 ruban(vec2 uv, out vec2 p){
  float asp = uRes.x / uRes.y;
  p = uv * vec2(asp, 1.0);
  vec2 a = uAncre * vec2(asp, 1.0);
  float t = uTime;
  float dx = p.x - a.x;
  float onde = 0.35 * sin(dx * 2.1 + t * 0.32) + (fbm(vec2(p.x * 0.8 + t * 0.035, t * 0.02)) - 0.5) * 1.6;
  float dy = p.y - (a.y + dx * uPente + onde * uEpaisseur);
  float largeur = uEpaisseur * (0.45 + 1.1 * fbm(p * 1.4 + vec2(-t * 0.05, t * 0.03)));
  return vec3(dy, largeur, exp(-pow(dx / uLongueur, 2.0)));
}

float densite(vec3 r, vec2 p){
  float travers = exp(-pow(r.x / r.y, 2.0));
  float grain = 0.45 + 0.8 * fbm(p * 4.5 + vec2(uTime * 0.08, -uTime * 0.05));
  return clamp(pow(r.z * travers, 0.8) * grain * uIntensite * 1.4, 0.0, 1.0);
}

// Repère d'une trame tournée : de l'écran vers la grille, et retour.
mat2 versGrille(float a){ float c = cos(a); float s = sin(a); return mat2(c, -s, s, c); }
mat2 versEcran(float a){ float c = cos(a); float s = sin(a); return mat2(c, s, -s, c); }

// Couverture d'un point de trame (pas s en pixels d'écran, grille tournée de a) ; la densité est lue au centre du
// point, et son rayon suit la racine de la densité (la surface encrée) : au-delà de 0,5, les points se touchent.
// Trait de 1 pixel environ autour de 0 pour une valeur v dont on connaît la pente en pixels (px).
float trait(float ecart, float px){ return 1.0 - smoothstep(0.0, px * 1.2, ecart); }

float pointDeTrame(float a, float s, float gain, out float d){
  vec2 q = versGrille(a) * gl_FragCoord.xy / s;
  vec2 c = floor(q) + 0.5;
  vec2 p;
  vec3 r = ruban((versEcran(a) * c) * s / uRes, p);
  d = densite(r, p) * gain;
  float rayon = 0.58 * sqrt(d);
  float px = 1.0 / s;
  return (1.0 - smoothstep(rayon - px, rayon + px, length(q - c))) * step(0.02, d);
}

void main(){
  vec2 p;
#if MOTIF == 0
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec2 dans = fract(gl_FragCoord.xy / uCell);
  vec2 uv = (cell + 0.5) * uCell / uRes;
  vec3 r = ruban(uv, p);
  float d = densite(r, p);
  // Poussière : quelques pixels isolés autour du ruban, qui changent toutes les deux secondes.
  float halo = r.z * exp(-pow(r.x / (r.y * 3.2), 2.0));
  float poussiere = step(0.975, hash(cell + floor(uTime * 0.5) * 7.13)) * halo * 0.55 * uIntensite;
  d = max(d, poussiere);
  float allume = step(bayer8(cell) + 0.015, d);
  float carre = step(dans.x, 0.78) * step(dans.y, 0.78);
  float alpha = allume * carre * (0.35 + 0.65 * d);
  vec3 col = rampe(d);
#elif MOTIF == 1
  // Grille tournée à 45°, comme la trame du noir en flexo.
  float d;
  float alpha = pointDeTrame(0.78539816, uCell * uDpr, 1.0, d) * (0.55 + 0.45 * d);
  vec3 col = rampe(d);
#elif MOTIF == 3
  // Trame en lignes à 30° : le trait, lu au milieu de sa bande, s'épaissit avec la densité.
  float s = uCell * uDpr * 1.3;
  float a = 0.52359878;
  vec2 q = versGrille(a) * gl_FragCoord.xy / s;
  float milieu = floor(q.y) + 0.5;
  vec3 r = ruban((versEcran(a) * vec2(q.x, milieu)) * s / uRes, p);
  float d = densite(r, p);
  float demi = 0.5 * d;
  float px = 1.0 / s;
  float alpha = (1.0 - smoothstep(demi - px, demi + px, abs(q.y - milieu))) * step(0.02, d) * (0.55 + 0.45 * d);
  vec3 col = rampe(d);
#elif MOTIF == 4
  // Rosette : deux encres, l'une à 15°, l'autre à 75°, qui se superposent comme sur une épreuve couleur.
  float s = uCell * uDpr;
  float d1;
  float d2;
  float a1 = pointDeTrame(0.26179939, s, 1.0, d1);
  float a2 = pointDeTrame(1.30899694, s * 1.06, 0.8, d2);
  float alpha = (a1 + a2 - a1 * a2) * 0.92;
  vec3 col = (a1 * (1.0 - a2) * c2 + a2 * (1.0 - a1) * c3 + a1 * a2 * mix(c2, c1, 0.5)) / max(a1 + a2 - a1 * a2, 1e-4);
#elif MOTIF == 5
  // Trame stochastique : des points fins, tous de la même taille, allumés au hasard selon la densité.
  float s = 2.4 * uDpr;
  vec2 cell = floor(gl_FragCoord.xy / s);
  vec3 r = ruban((cell + 0.5) * s / uRes, p);
  float d = densite(r, p);
  float allume = step(hash(cell * 1.37 + 0.5), d * 0.95);
  float rond = 1.0 - smoothstep(0.32, 0.5, length(fract(gl_FragCoord.xy / s) - 0.5));
  float alpha = allume * rond * (0.5 + 0.5 * d);
  vec3 col = rampe(d);
#elif MOTIF == 6
  // Vagues pleines : le ruban en plis doux, du sombre au clair, sans trame.
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 r = ruban(uv, p);
  float d = densite(r, p);
  float enveloppe = r.z * exp(-pow(r.x / (r.y * 1.8), 2.0));
  float plis = 0.5 + 0.5 * cos(r.x / r.y * 6.2831853 * 0.55);
  float alpha = clamp(enveloppe * uIntensite * 1.1, 0.0, 1.0) * (0.3 + 0.55 * plis);
  vec3 col = rampe(clamp(enveloppe * (0.45 + 0.55 * plis) + d * 0.25, 0.0, 1.0));
#elif MOTIF == 7
  // Alvéoles hexagonales d'un anilox : la plus proche est trouvée parmi deux grilles décalées.
  float s = uCell * uDpr * 1.15;
  vec2 q = gl_FragCoord.xy / s;
  const vec2 pas = vec2(1.0, 1.7320508);
  vec2 ga = mod(q, pas) - pas * 0.5;
  vec2 gb = mod(q - pas * 0.5, pas) - pas * 0.5;
  vec2 g = dot(ga, ga) < dot(gb, gb) ? ga : gb;
  vec3 r = ruban((q - g) * s / uRes, p);
  float d = densite(r, p);
  vec2 ag = abs(g);
  float hex = max(dot(ag, vec2(0.5, 0.8660254)), ag.x);
  float taille = 0.47 * sqrt(d);
  float px = 1.0 / s;
  float alpha = (1.0 - smoothstep(taille - px, taille + px, hex)) * step(0.02, d) * (0.55 + 0.45 * d);
  vec3 col = rampe(d);
#elif MOTIF == 8
  // Croix de repérage : bras plus longs et plus épais là où le ruban est dense.
  float s = uCell * uDpr * 2.0;
  vec2 q = gl_FragCoord.xy / s;
  vec2 c = floor(q) + 0.5;
  vec2 f = abs(q - c);
  vec3 r = ruban(c * s / uRes, p);
  float d = densite(r, p);
  float px = 1.0 / s;
  float bras = 0.46 * sqrt(d);
  float epais = 0.035 + 0.05 * d;
  float h = (1.0 - smoothstep(epais - px, epais + px, f.y)) * (1.0 - smoothstep(bras - px, bras + px, f.x));
  float v = (1.0 - smoothstep(epais - px, epais + px, f.x)) * (1.0 - smoothstep(bras - px, bras + px, f.y));
  float alpha = max(h, v) * step(0.04, d) * (0.6 + 0.4 * d);
  vec3 col = rampe(d);
#elif MOTIF == 9
  // Code-barres : des barres verticales de largeur variable (une à trois unités), découpées par le ruban.
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 r = ruban(uv, p);
  float d = densite(r, p);
  float unite = 2.0 * uDpr;
  float colonne = floor(gl_FragCoord.x / unite);
  float groupe = floor(colonne / 3.0);
  float largeur = 1.0 + floor(hash(vec2(groupe, 3.1)) * 3.0);
  float barre = step(mod(colonne, 3.0), largeur - 1.0) * step(0.35, hash(vec2(groupe, 7.7)));
  float alpha = barre * smoothstep(0.18, 0.4, d) * (0.4 + 0.6 * d);
  vec3 col = rampe(d);
#elif MOTIF == 10
  // Spires d'une bobine : des cercles fins autour du coin d'ancrage, allumés là où passe le ruban.
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 r = ruban(uv, p);
  float d = densite(r, p);
  float asp = uRes.x / uRes.y;
  float rho = length(p - uAncre * vec2(asp, 1.0));
  float frequence = 70.0;
  float v = rho * frequence + 0.6 * sin(rho * 9.0 - uTime * 0.4);
  float ecart = abs(fract(v + 0.5) - 0.5);
  float px = frequence / uRes.y;
  float spire = trait(ecart, px * 2.0) * (0.55 + 0.45 * hash(vec2(floor(v + 0.5), 1.3)));
  float alpha = spire * clamp(d * 1.9 + 0.3 * exp(-rho * 1.2), 0.0, 1.0);
  vec3 col = rampe(max(d, 0.3));
#elif MOTIF == 11
  // Étiquettes sur leur support, dans le sens du ruban : contour seul au bord, pleines au cœur.
  float s = uCell * uDpr * 2.2;
  float a = atan(uPente);
  vec2 q = versGrille(a) * gl_FragCoord.xy / s;
  vec2 cellule = vec2(1.6, 1.0);
  vec2 c = (floor(q / cellule) + 0.5) * cellule;
  vec2 f = q - c;
  vec3 r = ruban((versEcran(a) * c) * s / uRes, p);
  float d = densite(r, p);
  vec2 demi = cellule * 0.5 - 0.14;
  float rayon = 0.16;
  vec2 b = abs(f) - demi + rayon;
  float dist = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0) - rayon;
  float px = 1.0 / s;
  float plein = 1.0 - smoothstep(-px, px, dist);
  float bord = 1.0 - smoothstep(0.0, px * 1.5, abs(dist));
  float alpha = mix(bord, plein, smoothstep(0.45, 0.65, d)) * step(0.06, d) * (0.5 + 0.5 * d);
  vec3 col = rampe(d);
#elif MOTIF == 12
  // Moiré : deux trames de lignes fines, à 2° l'une de l'autre ; leurs franges dérivent avec le ruban.
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 r = ruban(uv, p);
  float d = densite(r, p);
  float s = 3.4 * uDpr;
  float y1 = (versGrille(0.785) * gl_FragCoord.xy).y / s;
  float y2 = (versGrille(0.82 + 0.01 * sin(uTime * 0.2)) * gl_FragCoord.xy).y / s;
  float e = 0.18 + 0.3 * d;
  float l1 = 1.0 - smoothstep(e - 0.25, e + 0.25, abs(fract(y1) - 0.5) * 2.0 - (1.0 - e * 2.0));
  float l2 = 1.0 - smoothstep(e - 0.25, e + 0.25, abs(fract(y2) - 0.5) * 2.0 - (1.0 - e * 2.0));
  float alpha = (l1 + l2 - l1 * l2) * smoothstep(0.04, 0.25, d) * (0.45 + 0.55 * d);
  vec3 col = rampe(d);
#else
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 r = ruban(uv, p);
  float d = densite(r, p);
  // Lignes de niveau de l'écart au ruban, rapporté à sa largeur : elles s'écartent quand il gonfle.
  float v = r.x / r.y * 4.0;
  float w = fwidth(v);
  float ecart = abs(fract(v + 0.5) - 0.5);
  float trait = clamp(1.0 - ecart / max(w * 1.15, 1e-4), 0.0, 1.0);
  float enveloppe = r.z * exp(-pow(r.x / (r.y * 2.2), 2.0));
  float alpha = trait * clamp(enveloppe * uIntensite * 1.3, 0.0, 1.0) * (0.4 + 0.6 * d);
  vec3 col = rampe(max(d, enveloppe * 0.6));
#endif
  gl_FragColor = vec4(col * alpha, alpha);
}`;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compiler(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

interface Props {
  placement?: PixelPlacement;
  /** 0 à 1,5 : densité du nuage. 1 pour l'accueil, autour de 0,6 derrière un tableau de bord. */
  intensite?: number;
  /** Côté d'un carré (ou pas de la trame), en pixels CSS. */
  cellule?: number;
  motif?: PixelMotif;
  className?: string;
}

/**
 * Une toile neuve à chaque changement de thème, de réglage ou d'animations : un contexte WebGL rendu au navigateur
 * (loseContext, au démontage) ne se récupère jamais sur la même toile. Sans la clé, repasser du jour à la nuit
 * laissait une toile au contexte perdu, donc plus de nuage.
 */
export function PixelField({ placement = 'bas-droite', intensite = 1, cellule = 4, motif = 'pixels', className = '' }: Props) {
  const nuit = useIsDark();
  const reduit = useReducedMotion();
  // Contexte perdu puis rendu par le navigateur (pilote graphique relancé) : on repart d'une toile neuve.
  const [generation, setGeneration] = useState(0);
  return (
    <Toile
      key={`${placement}-${intensite}-${cellule}-${motif}-${nuit}-${reduit}-${generation}`}
      placement={placement}
      intensite={intensite}
      cellule={cellule}
      motif={motif}
      className={className}
      nuit={nuit}
      reduit={reduit}
      onRendu={() => setGeneration((g) => g + 1)}
    />
  );
}

interface ToileProps extends Required<Props> {
  nuit: boolean;
  reduit: boolean;
  onRendu(): void;
}

/** La toile et son contexte, créés une fois au montage et rendus au démontage. */
function Toile({ placement, intensite, cellule, motif: voulu, className, nuit, reduit, onRendu }: ToileProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const onRenduRef = useRef(onRendu);
  onRenduRef.current = onRendu;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return;

    // Les ondes ont besoin des dérivées écran pour garder un trait d'un pixel : sans elles, retour aux carrés.
    const motif: PixelMotif = voulu === 'ondes' && !gl.getExtension('OES_standard_derivatives') ? 'pixels' : voulu;
    // Les carrés sont dessinés à 1 pixel CSS (agrandis nets) ; points et traits, à la densité de l'écran.
    const dpr = motif === 'pixels' ? 1 : Math.min(2, window.devicePixelRatio || 1);
    canvas.classList.toggle('is-lisse', motif !== 'pixels');
    const vs = compiler(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compiler(gl, gl.FRAGMENT_SHADER, fragment(motif));
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const { ancre, longueur, epaisseur, pente } = ANCRES[placement];
    gl.uniform1f(u('uCell'), cellule);
    gl.uniform1f(u('uDpr'), dpr);
    gl.uniform2f(u('uAncre'), ancre[0], ancre[1]);
    gl.uniform1f(u('uLongueur'), longueur);
    gl.uniform1f(u('uEpaisseur'), epaisseur);
    gl.uniform1f(u('uPente'), pente);
    gl.uniform1f(u('uIntensite'), intensite);
    (nuit ? RAMPE_NUIT : RAMPE_JOUR).forEach((c, i) => gl.uniform3fv(u(`c${i}`), rgb(c)));
    const uRes = u('uRes');
    const uTime = u('uTime');

    let w = 0;
    let h = 0;
    const taille = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width * dpr));
      h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };

    // Départ décalé et propre à chaque toile : deux nuages côte à côte ne battent pas à l'unisson.
    const origine = performance.now() - Math.random() * 40_000;
    const dessiner = (t: number) => {
      gl.uniform1f(uTime, (t - origine) / 1000);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    let visible = true;
    let raf = 0;
    let minuterie = 0;
    // Une image demandée seulement quand elle sera dessinée : 24 réveils par seconde, pas un par rafraîchissement
    // d'écran (120 sur un écran ProMotion).
    const boucle = (t: number) => {
      dessiner(t);
      minuterie = window.setTimeout(() => (raf = requestAnimationFrame(boucle)), 1000 / FPS);
    };
    const arreter = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(minuterie);
      raf = 0;
      minuterie = 0;
    };
    const relancer = () => {
      arreter();
      taille();
      if (reduit || !visible || document.hidden) {
        dessiner(performance.now());
        return;
      }
      raf = requestAnimationFrame(boucle);
    };

    const ro = new ResizeObserver(relancer);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      // Une toile collée au bord de l'écran compte comme « en intersection » sans rien montrer.
      visible = e.isIntersecting && e.intersectionRatio > 0;
      relancer();
    });
    io.observe(canvas);
    document.addEventListener('visibilitychange', relancer);
    // Perte de contexte par le navigateur : on arrête de dessiner, et on repart d'une toile neuve quand il le rend.
    const perdu = (e: Event) => {
      e.preventDefault();
      arreter();
    };
    const rendu = () => onRenduRef.current();
    canvas.addEventListener('webglcontextlost', perdu);
    canvas.addEventListener('webglcontextrestored', rendu);
    relancer();

    return () => {
      arreter();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', relancer);
      canvas.removeEventListener('webglcontextlost', perdu);
      canvas.removeEventListener('webglcontextrestored', rendu);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
    // Une seule fois par toile : tout changement de réglage passe par une toile neuve (clé dans PixelField).
  }, []);

  return <canvas ref={ref} className={`pixel-field ${className}`} aria-hidden="true" />;
}
