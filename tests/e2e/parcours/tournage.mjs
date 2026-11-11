/**
 * Tourne une courte vidéo d'un écran réel de la démo, avec un curseur visible, pour « Comment ça marche »
 * (src/pages/landing/features/Parcours.tsx). Le serveur de développement doit tourner (npm run dev).
 *
 *   node parcours/tournage.mjs parcours/plans/6-supervision.mjs ../../src/EVAN.Front/public/parcours [nuit|jour]
 *
 * Un plan exporte { nom, url, cadre: {w, x?, y?}, prepare?(outils), scene(outils) }. La page est rendue en entier
 * (1280 × 800, densité 2), mais la vidéo n'en garde qu'un cadre de `w` pixels de large au format 16:10 : une caméra
 * virtuelle qui suit le geste. `cadrer(cible, ms)` la déplace pendant la scène, sans l'attendre, vers un point
 * { x, y } ou le centre d'un élément ; dans `prepare`, elle la pose sans mouvement. Plus le cadre est étroit, plus le
 * texte de l'écran reste lisible une fois la vidéo réduite dans le volet (environ 740 px de large sur grand écran,
 * 360 px sur téléphone).
 *
 * Images prises par le screencast de Chrome (horodatées), assemblées par ffmpeg en 30 images par seconde ; sortie :
 * <nom>.mp4, <nom>-debut.webp, <nom>-fin.webp et <nom>.json (durée, à reporter dans src/pages/landing/lib/clips.ts),
 * suffixés de -jour pour le thème jour. Options : EVAN_URL (défaut http://localhost:5173), EVAN_NAVIGATEUR (canal
 * Playwright, défaut chrome : le Chrome installé).
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ici = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(ici, '../package.json'));
const { chromium } = require('@playwright/test');

const [,, planFichier, sortie, ambiance = 'nuit'] = process.argv;
const plan = (await import(resolve(planFichier))).default;
const jour = ambiance === 'jour';
const nom = jour ? `${plan.nom}-jour` : plan.nom;
const tmp = join(sortie, `_${nom}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const W = 1280, H = 800, DPR = 2;
// Sans --force-device-scale-factor, le screencast de Chrome sans fenêtre rend des images à la taille CSS (1280 × 800),
// densité ignorée : un cadre resserré serait agrandi, donc flou.
const browser = await chromium.launch({
  channel: process.env.EVAN_NAVIGATEUR ?? 'chrome',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', `--force-device-scale-factor=${DPR}`],
});
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, locale: 'fr-FR', reducedMotion: 'no-preference' });
await ctx.addInitScript((theme) => {
  localStorage.setItem('evan.theme', theme);
  // Curseur dessiné dans la page : le screencast ne montre pas celui du système.
  const poser = () => {
    if (document.getElementById('__curseur')) return;
    const c = document.createElement('div');
    c.id = '__curseur';
    c.innerHTML = `<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.6 14.9 L11.6 21.4 L14.4 20.2 L11.4 13.8 L17.6 13.8 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg><i></i>`;
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: '2147483647', pointerEvents: 'none', transform: 'translate(-100px,-100px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))' });
    const st = document.createElement('style');
    st.textContent = `#__curseur svg{position:absolute;left:-4px;top:-2px;transition:transform 120ms ease}#__curseur.bas svg{transform:scale(.86)}#__curseur i{position:absolute;left:-18px;top:-18px;width:36px;height:36px;border-radius:50%;border:2px solid rgba(255,140,80,.9);opacity:0;transform:scale(.4)}#__curseur.clic i{animation:__clic 520ms ease-out}@keyframes __clic{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.25)}}`;
    document.documentElement.append(st, c);
    addEventListener('mousemove', (e) => (c.style.transform = `translate(${e.clientX}px,${e.clientY}px)`), true);
    addEventListener('mousedown', () => { c.classList.add('bas'); c.classList.remove('clic'); void c.offsetWidth; c.classList.add('clic'); }, true);
    addEventListener('mouseup', () => c.classList.remove('bas'), true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', poser);
  else poser();
}, jour ? 'light' : 'dark');
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));

let souris = { x: W * 0.62, y: H * 0.55 };
const attendre = (ms) => page.waitForTimeout(ms);
const doux = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** Déplacement de la souris en courbe douce, en `ms` réelles (la position suit l'horloge, pas un nombre de pas). */
async function aller(x, y, ms = 700) {
  const de = { ...souris };
  // Légère courbe : le point de contrôle est décalé perpendiculairement au trajet.
  const cx = (de.x + x) / 2 + (y - de.y) * 0.12;
  const cy = (de.y + y) / 2 - (x - de.x) * 0.12;
  const t0 = Date.now();
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms);
    const t = doux(k);
    await page.mouse.move((1 - t) * (1 - t) * de.x + 2 * (1 - t) * t * cx + t * t * x, (1 - t) * (1 - t) * de.y + 2 * (1 - t) * t * cy + t * t * y);
    if (k >= 1) break;
    await attendre(8);
  }
  souris = { x, y };
}
async function centre(loc) {
  const b = await loc.boundingBox();
  if (!b) throw new Error('élément introuvable');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b };
}
async function cliquer(loc, ms = 700) {
  const c = await centre(loc);
  await aller(c.x, c.y, ms);
  await attendre(140);
  await page.mouse.down();
  await attendre(90);
  await page.mouse.up();
}
async function glisser(de, a, ms = 900) {
  await aller(de.x, de.y, 600);
  await attendre(120);
  await page.mouse.down();
  await attendre(120);
  await aller(a.x, a.y, ms);
  await attendre(100);
  await page.mouse.up();
}
async function molette(dy, ms = 700) {
  const t0 = Date.now();
  let fait = 0;
  for (;;) {
    const k = Math.min(1, (Date.now() - t0) / ms);
    const vise = dy * doux(k);
    await page.mouse.wheel(0, vise - fait);
    fait = vise;
    if (k >= 1) break;
    await attendre(12);
  }
}
// Caméra virtuelle : un cadre de largeur fixe (16:10) dont la position suit le geste. Chaque déplacement est noté
// avec son heure de départ et sa durée, puis rejoué par ffmpeg (filtre crop dont x et y dépendent du temps).
const CW = plan.cadre?.w ?? 640;
const CH = Math.round((CW * 10) / 16);
const borne = (v, max) => Math.round(Math.min(max, Math.max(0, v)));
const cadres = [{ t: 0, d: 0, x: borne(plan.cadre?.x ?? (W - CW) / 2, W - CW), y: borne(plan.cadre?.y ?? (H - CH) / 2, H - CH) }];
let t0 = null;
async function cadrer(cible, ms = 900) {
  const c = typeof cible?.boundingBox === 'function' ? await centre(cible) : cible;
  const x = borne(c.x - CW / 2, W - CW);
  const y = borne(c.y - CH / 2, H - CH);
  // Avant la scène, le cadre se pose sans bouger : c'est celui de la première image.
  if (t0 === null) cadres.splice(0, cadres.length, { t: 0, d: 0, x, y });
  else cadres.push({ t: (Date.now() - t0) / 1000, d: Math.max(0.05, ms / 1000), x, y });
}
const outils = { page, aller, cliquer, glisser, molette, attendre, centre, cadrer, W, H };

await page.goto(`${process.env.EVAN_URL ?? 'http://localhost:5173'}${plan.url}`, { waitUntil: 'load' });
await plan.prepare?.(outils);
await page.mouse.move(souris.x, souris.y);
await attendre(400);

const cdp = await ctx.newCDPSession(page);
const images = [];
cdp.on('Page.screencastFrame', async (f) => {
  images.push({ data: f.data, t: f.metadata.timestamp });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
t0 = Date.now();
// Un rechargement pendant la scène (le serveur de développement recharge la page quand un fichier change) ruinerait la
// prise sans erreur visible : il arrête le tournage.
let recharge = false;
page.on('load', () => (recharge = true));
await plan.scene(outils);
const duree = (Date.now() - t0) / 1000;
await cdp.send('Page.stopScreencast');
await browser.close();
if (recharge) throw new Error(`${nom} : la page s'est rechargée pendant la scène, prise à refaire`);

// Images et durées pour le démuxeur concat de ffmpeg ; la dernière tient jusqu'à la fin de la scène.
const debut = images[0].t;
let liste = '';
images.forEach((im, i) => {
  const f = `f${String(i).padStart(5, '0')}.jpg`;
  writeFileSync(join(tmp, f), Buffer.from(im.data, 'base64'));
  const fin = i + 1 < images.length ? images[i + 1].t : debut + duree;
  liste += `file '${f}'\nduration ${Math.max(0.001, fin - im.t).toFixed(4)}\n`;
});
liste += `file 'f${String(images.length - 1).padStart(5, '0')}.jpg'\n`;
writeFileSync(join(tmp, 'liste.txt'), liste);
const OUT_W = 1120, OUT_H = 700;
/**
 * Position du cadre au temps t (en pixels de la page) : la première, plus chaque déplacement pondéré par son
 * avancement adouci (smoothstep). Expression ffmpeg, évaluée à chaque image.
 */
function trajet(axe) {
  let expr = String(cadres[0][axe]);
  for (let i = 1; i < cadres.length; i++) {
    const { t, d } = cadres[i];
    const ecart = cadres[i][axe] - cadres[i - 1][axe];
    if (ecart) expr += `+(${ecart})*(st(0,clip((t-${t.toFixed(3)})/${d.toFixed(3)},0,1));ld(0)*ld(0)*(3-2*ld(0)))`;
  }
  return expr;
}
// Le screencast peut rendre des images plus petites que la page en pixels réels : le cadre suit leur taille. Le
// passage en RGB avant le recadrage évite que la chrominance arrondisse x et y au pixel pair (le cadre tremblerait).
const filtre = [
  'format=rgb24',
  `crop=w=iw*${CW / W}:h=ih*${CH / H}:x='(${trajet('x')})*iw/${W}':y='(${trajet('y')})*ih/${H}'`,
  `scale=${OUT_W}:${OUT_H}:flags=lanczos`,
  'fps=30',
  'format=yuv420p',
].join(',');
const mp4 = join(sortie, `${nom}.mp4`);
// La dernière image est répétée pour que le démuxeur tienne sa durée ; ffmpeg prête à la copie la même durée, la vidéo
// s'allongerait d'autant (une fin figée de plusieurs secondes) : -t la coupe à la durée réelle de la scène.
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'liste.txt'), '-t', duree.toFixed(3), '-vf', filtre, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(plan.crf ?? 26), '-tune', 'animation', '-movflags', '+faststart', '-an', mp4]);
// Affiches : la première image (pendant le chargement de la vidéo) et la dernière (animations réduites).
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4, '-frames:v', '1', join(tmp, 'debut.png')]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-0.2', '-i', mp4, '-frames:v', '1', join(tmp, 'fin.png')]);
// sharp vient des dépendances du front (ffmpeg n'écrit pas toujours le WebP).
const sharp = createRequire(join(ici, '../../../src/EVAN.Front/package.json'))('sharp');
await sharp(join(tmp, 'debut.png')).webp({ quality: 78 }).toFile(join(sortie, `${nom}-debut.webp`));
await sharp(join(tmp, 'fin.png')).webp({ quality: 78 }).toFile(join(sortie, `${nom}-fin.webp`));
const dureeMp4 = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp4]).toString());
writeFileSync(join(sortie, `${nom}.json`), JSON.stringify({ nom, duree: Math.round(dureeMp4 * 1000) }));
const taille = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', join(tmp, 'f00000.jpg')]).toString().trim();
rmSync(tmp, { recursive: true, force: true });
console.log(`images de ${taille}`);
console.log(`${nom} : ${images.length} images, ${duree.toFixed(1)} s`);
