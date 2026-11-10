/**
 * Tourne une courte vidéo d'un écran réel de la démo, avec un curseur visible, pour « Comment ça marche »
 * (src/pages/landing/features/Parcours.tsx). Le serveur de développement doit tourner (npm run dev).
 *
 *   node parcours/tournage.mjs parcours/plans/6-supervision.mjs ../../src/EVAN.Front/public/parcours
 *
 * Un plan exporte { nom, url, cadre: {x,y,w,h}, prepare?(outils), scene(outils) }. Images prises par le screencast de
 * Chrome (horodatées), assemblées par ffmpeg en 30 images par seconde ; sortie : <nom>.mp4, <nom>-debut.webp,
 * <nom>-fin.webp et <nom>.json (durée, à reporter dans src/pages/landing/lib/clips.ts). Options : EVAN_URL (défaut
 * http://localhost:5173).
 */
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ici = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(ici, '../package.json'));
const { chromium } = require('@playwright/test');

const [,, planFichier, sortie] = process.argv;
const plan = (await import(resolve(planFichier))).default;
const nom = plan.nom;
const tmp = join(sortie, `_${nom}`);
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const W = 1280, H = 800, DPR = 2;
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
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
}, plan.theme ?? 'dark');
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
const outils = { page, aller, cliquer, glisser, molette, attendre, centre, W, H };

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
const t0 = Date.now();
await plan.scene(outils);
const duree = (Date.now() - t0) / 1000;
await cdp.send('Page.stopScreencast');
await browser.close();

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
const { x, y, w, h } = plan.cadre;
const OUT_W = 1120, OUT_H = 700;
// Le screencast peut rendre des images plus petites que la page en pixels réels : le cadre suit leur taille.
const filtre = `crop=iw*${w / W}:ih*${h / H}:iw*${x / W}:ih*${y / H},scale=${OUT_W}:${OUT_H}:flags=lanczos,fps=30,format=yuv420p`;
const mp4 = join(sortie, `${nom}.mp4`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'liste.txt'), '-vf', filtre, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(plan.crf ?? 24), '-tune', 'animation', '-movflags', '+faststart', '-an', mp4]);
// Affiche : l'état final de la scène, pour l'attente du chargement et les animations réduites.
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
