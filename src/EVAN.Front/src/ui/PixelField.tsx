/**
 * Nuage de pixels rouge EVAN, en fond : un champ de bruit tramé (trame de Bayer 8 × 8) dessiné par un petit
 * shader, qui dérive lentement depuis un coin. Pure décoration : il ne capte aucun clic et n'est pas lu.
 *
 * Coût maîtrisé : toile à 1 pixel CSS par pixel pour les carrés (gros, `image-rendering: pixelated` les garde nets), à
 * la densité de l'écran pour les spires (traits fins, lissés), 24 images par seconde au plus, arrêt hors écran,
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
 * Deux motifs pour un même ruban :
 * - `pixels` : les carrés tramés de la marque, dans l'application ;
 * - `spires` : les spires d'une bobine vue de côté, centrées sur le coin d'où part le ruban, sur l'accueil.
 */
export type PixelMotif = 'pixels' | 'spires';

function fragment(motif: PixelMotif) {
  return `precision ${motif === 'pixels' ? 'mediump' : 'highp'} float;
#define SPIRES ${motif === 'spires' ? 1 : 0}
// Les spires calculent leur champ à chaque pixel : trois octaves suffisent, les carrés en gardent cinq.
#define OCTAVES ${motif === 'pixels' ? 5 : 3}
uniform vec2 uRes;
uniform float uTime;
uniform float uCell;
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

// Trait de 1 pixel environ autour de 0 pour une valeur v dont on connaît la pente en pixels (px).
float trait(float ecart, float px){ return 1.0 - smoothstep(0.0, px * 1.2, ecart); }

void main(){
  vec2 p;
#if SPIRES == 0
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
#else
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
  /** Côté d'un carré, en pixels CSS. Sans effet sur les spires. */
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
function Toile({ placement, intensite, cellule, motif, className, nuit, reduit, onRendu }: ToileProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const onRenduRef = useRef(onRendu);
  onRenduRef.current = onRendu;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, powerPreference: 'low-power' });
    if (!gl) return;

    // Les carrés sont dessinés à 1 pixel CSS (agrandis nets) ; les spires, à la densité de l'écran.
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
