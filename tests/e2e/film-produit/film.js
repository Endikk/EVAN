/**
 * Film produit d'EVAN (README), rendu image par image : window.film.aller(f) pose l'image f (30 i/s) et
 * window.film.pret se résout quand modèles, polices et captures sont chargés. Aucune horloge réelle : tout dépend
 * de f, le rendu est donc reproductible. Les chiffres affichés viennent de data/kit/machines.json et de data/demo.json.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const IPS = 30;
const L = 1600, H = 900;
const PRUSSE = 0x0d1f33, OK = 0x2fd07f, CRIT = 0xff3d6e;
const $ = (s, r = document) => r.querySelector(s);
const cl = (x) => Math.min(1, Math.max(0, x));
/** Avancement 0..1 d'un mouvement qui part à `a` et dure `d` secondes. */
const p = (t, a, d) => cl((t - a) / d);
const sortir = (k) => 1 - Math.pow(1 - k, 4);
const entreSortie = (k) => (k < 0.5 ? 8 * k * k * k * k : 1 - Math.pow(-2 * k + 2, 4) / 2);
const melange = (a, b, k) => a + (b - a) * k;
/** Texte qui monte derrière son masque. */
const lever = (m, k) => { m.firstElementChild.style.transform = `translateY(${(1 - sortir(k)) * 112}%)`; };

// ───────────────────────── Découpage (secondes) ─────────────────────────
const CONFIG = [
  ['localiser', 'Trouver l’usine', 'Sur la photo satellite. Le contour du bâtiment est relevé au mètre.'],
  ['plan', 'Tracer le plan', 'Hauteurs, niveaux et zones de l’atelier, en 3D ou en plan coté.'],
  ['machines', 'Poser les machines', 'Prises dans la bibliothèque, déposées à leur place.'],
  ['organes', 'Choisir ce qu’on surveille', 'Organe par organe, avec les plages de chaque mesure.'],
  ['connexion', 'Brancher les automates', 'OPC UA, Modbus TCP, Siemens S7, JDF / JMF ou MQTT.'],
];
const EXPLOITER = [
  ['historique', 'Historique', 'Où le temps se perd, machine par machine.'],
  ['maintenance', 'Maintenance', 'Les entretiens à faire et les mesures qui dérivent avant la panne.'],
  ['energie', 'Énergie', 'Les kWh, les euros et le CO₂, jusqu’aux 1 000 étiquettes.'],
  ['organisation', 'Plusieurs usines', 'Tours et Crissey côte à côte, chacune avec son plan.'],
];
const PAS_CARTE = 1.45, PAS_MODELE = 1.05;
const D = { A: 7.0, B: CONFIG.length * PAS_CARTE, C: 8 * PAS_MODELE, C2: 3.0, Dd: 5.6, E: 11.2, F: EXPLOITER.length * PAS_CARTE, G: 6 * 1.05 + 1.7, Hh: 3.6 };
const T = {};
{ let t = 0; for (const [k, d] of Object.entries(D)) { T[k] = t; t += d; } T.fin = t; }
/** L'atelier de l'ouverture : les 14 machines de l'usine de Tours, resserrées sur trois rangs (devant, milieu, fond). */
const RANGS = [['R01', 'R02', 'R03', 'R04'], ['R05', 'R06', 'R07', 'R08'], ['PP01', 'RFID01', 'RF01', 'RF02', 'PV01', 'FE01']];

// ───────────────────────── Scène 3D ─────────────────────────
const toile = $('#gl');
const rendu = new THREE.WebGLRenderer({ canvas: toile, antialias: true, preserveDrawingBuffer: true });
rendu.setPixelRatio(2);
rendu.setSize(L, H, false);
rendu.setClearColor(PRUSSE);
rendu.toneMapping = THREE.ACESFilmicToneMapping;
rendu.toneMappingExposure = 1.05;
rendu.shadowMap.enabled = true;
rendu.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(PRUSSE, 30, 95);
scene.environment = new THREE.PMREMGenerator(rendu).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(28, L / H, 0.5, 300);
const soleil = new THREE.DirectionalLight(0xffffff, 2.6);
soleil.castShadow = true;
soleil.shadow.mapSize.set(4096, 4096);
soleil.shadow.bias = -0.0003;
soleil.shadow.normalBias = 0.04;
scene.add(soleil, soleil.target);
const appoint = new THREE.DirectionalLight(0x9fc4ff, 0.7);
scene.add(appoint, appoint.target);
const sol = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x14293f, roughness: 0.95, metalness: 0 }));
sol.rotation.x = -Math.PI / 2;
sol.receiveShadow = true;
scene.add(sol);
/** Niveau de lumière de l'atelier, 0 (éteint) à 1 (plein jour). */
function eclairer(k) {
  soleil.intensity = melange(0.12, 2.6, k);
  appoint.intensity = melange(0.1, 0.7, k);
  scene.environmentIntensity = melange(0.08, 0.55, k);
}

/** Repère rouleaux, bandes et points de diagnostic d'un modèle (conventions du kit : userData.role, nœuds diag_N). */
function preparer(racine) {
  const rotatifs = [], bandes = [], diag = new Map();
  racine.traverse((o) => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    const ud = o.userData;
    if (ud.role === 'rotatif' && typeof ud.vitesseRadS === 'number') rotatifs.push({ o, base: o.quaternion.clone(), v: ud.vitesseRadS });
    if (ud.role === 'bande') {
      const cadence = (Number(ud.vitesseMS) || 0.5) / (Number(ud.pasEtiquetteM) || 0.11);
      o.traverse((c) => { const m = c.material; if (m && !Array.isArray(m) && m.map) { m.map.wrapS = THREE.RepeatWrapping; m.map.needsUpdate = true; bandes.push({ tex: m.map, cadence }); } });
    }
    if (o.name.startsWith('diag_') && typeof ud.numero === 'number') diag.set(ud.numero, o);
  });
  return { rotatifs, bandes, diag };
}
/** Les 8 machines du kit, posées au sol et centrées. */
const machines = [];
async function chargerMachine(def) {
  const racine = (await new GLTFLoader().loadAsync(`/modeles/${def.id}.glb`)).scene;
  const boite = new THREE.Box3().setFromObject(racine);
  const taille = boite.getSize(new THREE.Vector3());
  const centre = boite.getCenter(new THREE.Vector3());
  racine.position.set(-centre.x, -boite.min.y, -centre.z);
  const groupe = new THREE.Group();
  groupe.add(racine);
  scene.add(groupe);
  return { def, groupe, taille, ...preparer(racine), organes: def.points_diagnostic.length, mesures: def.points_diagnostic.reduce((n, o) => n + o.capteurs_donnees.length, 0) };
}
/** Les 14 machines de l'atelier d'ouverture : des copies des modèles, chacune avec son contour d'état au sol. */
const atelier = [];
function contour(lx, lz, epaisseur) {
  const f = new THREE.Shape();
  f.moveTo(-lx / 2, -lz / 2); f.lineTo(lx / 2, -lz / 2); f.lineTo(lx / 2, lz / 2); f.lineTo(-lx / 2, lz / 2); f.closePath();
  const t = new THREE.Path();
  const ix = lx / 2 - epaisseur, iz = lz / 2 - epaisseur;
  t.moveTo(-ix, -iz); t.lineTo(-ix, iz); t.lineTo(ix, iz); t.lineTo(ix, -iz); t.closePath();
  f.holes.push(t);
  return new THREE.ShapeGeometry(f);
}
function monterAtelier(demo) {
  const parNumero = new Map(demo.usines[0].machines.map((m) => [m.numero, m]));
  RANGS.forEach((rang, r) => {
    const ecart = 3.2;
    const gabarits = rang.map((n) => machines.find((m) => m.def.id === parNumero.get(n).type));
    const largeur = gabarits.reduce((s, g) => s + g.taille.x, 0) + ecart * (rang.length - 1);
    let x = -largeur / 2;
    rang.forEach((numero, i) => {
      const g = gabarits[i];
      const groupe = g.groupe.clone(true);
      groupe.position.set(x + g.taille.x / 2, 0, [9, 0, -9][r]);
      x += g.taille.x + ecart;
      const lx = g.taille.x + 1.5, lz = g.taille.z + 1.5;
      const mat = () => new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
      const trait = new THREE.Mesh(contour(lx, lz, 0.14), mat());
      const onde = new THREE.Mesh(contour(lx, lz, 0.1), mat());
      const fond = new THREE.Mesh(new THREE.PlaneGeometry(lx, lz), mat());
      for (const m of [fond, trait, onde]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.03; groupe.add(m); }
      fond.position.y = 0.02;
      scene.add(groupe);
      atelier.push({ numero, groupe, taille: g.taille, trait, onde, fond, ...preparer(groupe.children[0]) });
    });
  });
}
const axeY = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
function animer(liste, t) {
  for (const m of liste) {
    for (const r of m.rotatifs) r.o.quaternion.copy(r.base).multiply(q.setFromAxisAngle(axeY, r.v * t));
    for (const b of m.bandes) b.tex.offset.x = -((b.cadence * t) % 1);
  }
}
/** Disposition : l'atelier d'ouverture, les 8 machines en ligne (travelling) ou sur deux rangs (vue d'ensemble). */
function placer(mode) {
  for (const m of atelier) m.groupe.visible = mode === 'atelier';
  for (const m of machines) m.groupe.visible = mode !== 'atelier';
  if (mode === 'ligne') {
    let x = 0;
    for (const m of machines) { m.groupe.position.set(x + m.taille.x / 2, 0, 0); x += m.taille.x + 9; }
  }
  if (mode === 'rangs') {
    [[0, 1, 3, 7], [2, 5, 6, 4]].forEach((rang, r) => {
      const ecart = 3.4;
      const largeur = rang.reduce((s, i) => s + machines[i].taille.x, 0) + ecart * (rang.length - 1);
      let x = -largeur / 2;
      for (const i of rang) { const m = machines[i]; m.groupe.position.set(x + m.taille.x / 2, 0, r === 0 ? -5.2 : 4.2); x += m.taille.x + ecart; }
    });
  }
}
const cible = new THREE.Vector3(), v3 = new THREE.Vector3();
/** Caméra en orbite autour d'un point : distance, azimut, élévation ; `decale` déplace le sujet dans le cadre (pixels). */
function cadrer({ x, y, z, d, az, el, decale = [0, 0], ombre = 18 }) {
  cible.set(x, y, z);
  scene.fog.near = d * 0.95;
  scene.fog.far = d * 2.4;
  camera.position.set(x + d * Math.sin(az) * Math.cos(el), y + d * Math.sin(el), z + d * Math.cos(az) * Math.cos(el));
  camera.lookAt(cible);
  camera.setViewOffset(L, H, decale[0], decale[1], L, H);
  camera.updateMatrixWorld();
  soleil.position.set(x - 10, 22, z + 14);
  soleil.target.position.copy(cible);
  const o = soleil.shadow.camera;
  o.left = -ombre; o.right = ombre; o.top = ombre; o.bottom = -ombre; o.near = 1; o.far = 90;
  o.updateProjectionMatrix();
  appoint.position.set(x + 14, 9, z - 10);
  appoint.target.position.copy(cible);
}
const ecran = (x, y, z) => { v3.set(x, y, z).project(camera); return [(v3.x * 0.5 + 0.5) * L, (-v3.y * 0.5 + 0.5) * H]; };
const poseMachine = (m, t) => ({ x: m.groupe.position.x, y: m.taille.y * 0.5, z: 0, d: Math.max(m.taille.x * 1.72, 12.5), az: 0.52 - 0.03 * t, el: 0.19, decale: [0, 95], ombre: 18 });
const interpoler = (a, b, k) => ({ x: melange(a.x, b.x, k), y: melange(a.y, b.y, k), z: melange(a.z, b.z, k), d: melange(a.d, b.d, k), az: melange(a.az, b.az, k), el: melange(a.el, b.el, k), decale: [melange(a.decale[0], b.decale[0], k), melange(a.decale[1], b.decale[1], k)], ombre: melange(a.ombre, b.ombre, k) });

// ───────────────────────── Sections DOM ─────────────────────────
const sections = { A: $('#sA'), cartes: $('#sCartes'), C: $('#sC'), D: $('#sD'), E: $('#sE'), G: $('#sG'), H: $('#sH') };
function montrer(nom, avec3d) {
  for (const [k, s] of Object.entries(sections)) s.style.display = k === nom ? 'block' : 'none';
  toile.style.display = avec3d ? 'block' : 'none';
}
const images = new Map();
function charger(url) {
  if (!images.has(url)) images.set(url, new Promise((ok) => { const i = new Image(); i.onload = () => i.decode().then(() => ok(i), () => ok(i)); i.onerror = () => ok(i); i.src = url; }));
  return images.get(url);
}
function poser(img, url) {
  if (img.dataset.url === url) return Promise.resolve();
  img.dataset.url = url;
  return new Promise((ok) => { img.onload = () => img.decode().then(ok, ok); img.onerror = ok; img.src = url; });
}
/** Bloc de texte de l'ouverture : il entre par son masque, puis sort vers le haut. */
function bloc(el, t, entree, sortie) {
  const dehors = sortie === undefined ? 0 : entreSortie(p(t, sortie, 0.28));
  el.style.display = t >= entree - 0.05 && dehors < 1 ? '' : 'none';
  el.style.opacity = String(1 - dehors);
  el.style.transform = `translateY(${-dehors * 70}px)`;
}

// A. Ouverture : l'atelier s'allume machine par machine, la presse R01 s'arrête, la caméra fond sur elle
const TP = 2.35, TQ = 3.55, TLOGO = 5.35;
function sceneA(t, tAbs) {
  montrer('A', t < TLOGO);
  const carte = $('#carteLogo');
  carte.style.display = t >= TLOGO ? 'block' : 'none';
  if (t >= TLOGO) {
    const kl = sortir(p(t, TLOGO + 0.05, 0.55));
    const logo = $('#logoA');
    logo.style.opacity = String(kl);
    logo.style.transform = `scale(${melange(0.88, 1, kl)})`;
    document.documentElement.style.setProperty('--etat', t < TLOGO + 0.7 ? 'var(--crit)' : 'var(--ok)');
    lever($('#carteLogo .signature'), p(t, TLOGO + 0.55, 0.5));
    return;
  }
  placer('atelier');
  eclairer(melange(0.2, 1, sortir(p(t, 0.1, 1.5))));
  const r01 = atelier[0];
  const kLarge = sortir(p(t, 0, TP + 0.4));
  const large = { x: 0, y: 0.5, z: 0, d: melange(74, 61, kLarge), az: melange(0.72, 0.46, kLarge), el: melange(0.6, 0.5, kLarge), decale: [0, 120], ombre: 36 };
  const kPres = sortir(p(t, TP, TLOGO - TP));
  const pres = { x: r01.groupe.position.x, y: 1.5, z: r01.groupe.position.z, d: melange(20, 15.2, kPres), az: melange(0.62, 0.3, kPres), el: 0.2, decale: [-170, 110], ombre: 22 };
  cadrer(interpoler(large, pres, entreSortie(p(t, TP, 0.9))));
  const panne = t >= TP;
  let allumees = 0;
  const tags = $('#tagsA');
  if (!tags.childElementCount) tags.innerHTML = atelier.map((m) => `<span><i></i>${m.numero}</span>`).join('');
  atelier.forEach((m, i) => {
    const k = sortir(p(t, 0.35 + i * 0.085, 0.3));
    if (k > 0.5) allumees++;
    const enPanne = panne && m === r01;
    const voile = panne && !enPanne ? melange(1, 0.22, p(t, TP, 0.35)) : 1;
    m.trait.material.color.setHex(enPanne ? CRIT : OK);
    m.fond.material.color.setHex(enPanne ? CRIT : OK);
    m.onde.material.color.setHex(CRIT);
    m.trait.material.opacity = k * voile;
    m.fond.material.opacity = k * voile * (enPanne ? 0.2 : 0.09);
    m.trait.scale.setScalar(melange(0.86, 1, k));
    const onde = enPanne ? ((t - TP) % 0.9) / 0.9 : 0;
    m.onde.material.opacity = enPanne ? 0.85 * (1 - onde) : 0;
    m.onde.scale.setScalar(1 + onde * 0.42);
    const tag = tags.children[i];
    const [x, y] = ecran(m.groupe.position.x, m.taille.y + 0.9, m.groupe.position.z);
    tag.style.left = `${x}px`; tag.style.top = `${y}px`;
    tag.classList.toggle('crit', enPanne);
    tag.style.opacity = String(k * (panne && !enPanne ? 1 - p(t, TP, 0.3) : 1));
    tag.style.transform = `translate(-50%,-100%) scale(${melange(0.7, enPanne ? 1.25 : 1, k)})`;
  });
  animer(atelier.filter((m) => !(panne && m === r01)), tAbs);
  rendu.render(scene, camera);
  // Les textes : le compteur suit l'allumage, puis les deux coups de la panne, puis les deux questions.
  const b1 = $('#sA .b1'), b2 = $('#sA .b2'), b3 = $('#sA .b3');
  bloc(b1, t, 0, TP - 0.2);
  $('#nA').textContent = String(allumees);
  $('#nA').style.opacity = String(p(t, 0.3, 0.2));
  lever($('#sA .t1'), p(t, 0.5, 0.5));
  bloc(b2, t, TP, TQ - 0.22);
  lever(b2.firstElementChild, p(t, TP + 0.05, 0.4));
  bloc(b3, t, TQ);
  lever($('#sA .q1'), p(t, TQ, 0.4));
  lever($('#sA .q2'), p(t, TQ + 0.6, 0.4));
  // « Quel organe ? » : les organes de la presse se signalent un à un, comme une recherche.
  const bulles = $('#bullesA');
  const numeros = [...r01.diag.keys()].sort((a, b) => a - b);
  if (!bulles.childElementCount) bulles.innerHTML = numeros.map(() => '<i>?</i>').join('');
  const vu = Math.floor((t - (TQ + 0.7)) / 0.11) % numeros.length;
  numeros.forEach((n, i) => {
    const b = bulles.children[i];
    const k = sortir(p(t, TQ + 0.62 + i * 0.05, 0.28));
    const w = r01.diag.get(n).getWorldPosition(new THREE.Vector3());
    const [x, y] = ecran(w.x, w.y, w.z);
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    b.style.transform = `scale(${k * (i === vu ? 1.28 : 1)})`;
    b.classList.toggle('vu', i === vu);
  });
}

// B et F. Écrans en cartes
function sceneCartes(t, liste, chapitre) {
  montrer('cartes', false);
  const i = Math.min(liste.length - 1, Math.floor(t / PAS_CARTE));
  const u = t - i * PAS_CARTE;
  const [nom, titre, desc] = liste[i];
  $('#sCartes .chap').textContent = chapitre;
  $('#sCartes .num').innerHTML = `${i + 1}<small> / ${liste.length}</small>`;
  const tm = $('#sCartes .titre');
  tm.firstElementChild.textContent = titre;
  lever(tm, p(u, 0.05, 0.42));
  const d = $('#sCartes .desc');
  d.textContent = desc;
  const kd = sortir(p(u, 0.2, 0.4));
  d.style.opacity = String(kd);
  d.style.transform = `translateY(${(1 - kd) * 12}px)`;
  const ticks = $('#sCartes .ticks');
  if (ticks.childElementCount !== liste.length) ticks.innerHTML = liste.map(() => '<i></i>').join('');
  [...ticks.children].forEach((x, j) => x.classList.toggle('on', j <= i));
  const cour = $('#cCour'), prec = $('#cPrec');
  const k = sortir(p(u, 0, 0.6));
  cour.style.opacity = String(cl(k * 1.6));
  cour.style.transform = `translate3d(${(1 - k) * 420}px,0,${(1 - k) * -260}px) rotateY(${melange(-34, -5, k)}deg) rotateX(${melange(6, 2, k)}deg)`;
  cour.firstElementChild.style.transform = `scale(${1.015 + 0.035 * (u / PAS_CARTE)})`;
  const attente = [poser(cour.firstElementChild, `/ecrans/${nom}.jpg`)];
  if (i > 0 && u < 0.6) {
    prec.style.display = 'block';
    prec.style.opacity = String(1 - cl(k * 1.5));
    prec.style.transform = `translate3d(${-k * 300}px,0,${-k * 320}px) rotateY(${melange(-5, 12, k)}deg) rotateX(2deg)`;
    attente.push(poser(prec.firstElementChild, `/ecrans/${liste[i - 1][0]}.jpg`));
  } else prec.style.display = 'none';
  return Promise.all(attente);
}

// C. Les machines du kit, une à une puis toutes ensemble
const etiq = $('#etiq');
function sceneC(t, tAbs) {
  montrer('C', true);
  eclairer(1);
  const ensemble = t >= D.C;
  $('#sC .tete').style.display = $('#sC .fiche').style.display = $('#sC .ticks').style.display = ensemble ? 'none' : '';
  $('#sC .grand').style.display = etiq.style.display = ensemble ? 'block' : 'none';
  if (!ensemble) {
    placer('ligne');
    const i = Math.min(7, Math.floor(t / PAS_MODELE));
    const u = t - i * PAS_MODELE;
    const m = machines[i];
    const arrivee = poseMachine(m, t);
    // Le premier plan arrive de loin ; les suivants glissent d'une machine à l'autre.
    const depart = i === 0 ? { ...arrivee, d: arrivee.d * 2.1, el: 0.42, az: arrivee.az + 0.5 } : poseMachine(machines[i - 1], t);
    cadrer(interpoler(depart, arrivee, entreSortie(p(u, 0, i === 0 ? 0.75 : 0.5))));
    $('#sC .idx').textContent = `${String(i + 1).padStart(2, '0')} / 08`;
    const nm = $('#sC .nom');
    nm.firstElementChild.textContent = m.def.nom;
    lever(nm, p(u, 0.18, 0.4));
    const kp = sortir(p(u, 0.3, 0.35));
    for (const sel of ['.proc', '.cpt']) { const e = $(`#sC ${sel}`); e.style.opacity = String(kp); e.style.transform = `translateY(${(1 - kp) * 10}px)`; }
    $('#sC .proc').textContent = m.def.procede;
    $('#sC .cpt').textContent = `${m.organes} organes · ${m.mesures} mesures`;
    const ticks = $('#sC .ticks');
    if (!ticks.childElementCount) ticks.innerHTML = '<i></i>'.repeat(8);
    [...ticks.children].forEach((x, j) => x.classList.toggle('on', j <= i));
  } else {
    const u = t - D.C;
    const k = sortir(p(u, 0, D.C2));
    placer('rangs');
    cadrer({ x: 0, y: 0.6, z: 0, d: melange(54, 48, k), az: melange(0.3, 0.14, k), el: 0.46, decale: [95, -60], ombre: 34 });
    lever($('#sC .grand'), p(u, 0.1, 0.5));
    if (!etiq.childElementCount) etiq.innerHTML = machines.map(() => '<span class="mono"></span>').join('');
    machines.forEach((m, i) => {
      const s = etiq.children[i];
      const [x, y] = ecran(m.groupe.position.x, 0, m.groupe.position.z + m.taille.z / 2 + 1.2);
      s.textContent = m.def.nom;
      s.style.left = `${x}px`; s.style.top = `${y}px`;
      s.style.opacity = String(sortir(p(u, 0.45 + i * 0.07, 0.35)));
    });
  }
  animer(machines, tAbs);
  rendu.render(scene, camera);
}

// D. Les organes de la presse flexo
function sceneD(t, tAbs) {
  montrer('D', true);
  eclairer(1);
  placer('ligne');
  const m = machines[0];
  const k = sortir(p(t, 0, D.Dd));
  cadrer({ x: m.groupe.position.x, y: m.taille.y * 0.45, z: 0, d: melange(17.2, 15.4, k), az: melange(0.72, 0.36, k), el: 0.26, decale: [300, -10] });
  animer(machines, tAbs);
  rendu.render(scene, camera);
  lever($('#sD .titre'), p(t, 0.1, 0.5));
  $('#sD .sous').style.opacity = String(sortir(p(t, 0.4, 0.4)));
  const liste = $('#sD ol'), bulles = $('#bulles');
  const organes = m.def.points_diagnostic;
  if (!liste.childElementCount) {
    liste.innerHTML = organes.map((o) => `<li><b>${o.numero}</b><span>${o.nom}</span></li>`).join('');
    bulles.innerHTML = organes.map((o) => `<i>${o.numero}<u></u></i>`).join('');
  }
  const alerte = t >= 3.9;
  organes.forEach((o, i) => {
    const ka = sortir(p(t, 0.7 + i * 0.26, 0.35));
    const crit = alerte && o.numero === 7;
    const li = liste.children[i], b = bulles.children[i];
    li.style.opacity = String(alerte && !crit ? melange(1, 0.4, p(t, 3.9, 0.3)) : ka);
    li.style.transform = `translateX(${(1 - ka) * 18}px)`;
    li.classList.toggle('crit', crit);
    const noeud = m.diag.get(o.numero);
    if (!noeud) { b.style.display = 'none'; return; }
    const w = noeud.getWorldPosition(new THREE.Vector3());
    const [x, y] = ecran(w.x, w.y, w.z);
    b.style.left = `${x}px`; b.style.top = `${y}px`;
    b.style.transform = `scale(${ka * (crit ? 1.25 : 1)})`;
    b.style.opacity = String(alerte && !crit ? melange(1, 0.3, p(t, 3.9, 0.3)) : 1);
    b.classList.toggle('crit', crit);
    const onde = crit ? ((t - 3.9) % 0.8) / 0.8 : 0;
    b.lastElementChild.style.opacity = crit ? String(0.9 * (1 - onde)) : '0';
    b.lastElementChild.style.transform = `scale(${1 + onde * 1.6})`;
  });
  const al = $('#sD .alarme');
  al.textContent = `${organes[6].alarme_simulee.code} · ${organes[6].alarme_simulee.message}`;
  al.style.opacity = String(sortir(p(t, 4.0, 0.3)));
}

// E. La panne en direct, filmée sur l'application. Les temps sont ceux du plan filmé, en secondes.
const TEMPS_E = [
  [0, ['L’atelier', 'tourne.'], '14 machines suivies, chacune avec son état.'],
  [2.75, ['Casse', 'd’échenillage.'], 'La presse R01 passe au rouge sur le plan.'],
  [5.6, ['Jusqu’à', 'l’organe.'], 'EVAN plonge sur la pièce et dit quoi vérifier.'],
];
let nClip = 1;
function sceneE(t) {
  montrer('E', false);
  const tc = (t / D.E) * (nClip / IPS);
  const i = TEMPS_E.findLastIndex((x) => tc >= x[0]);
  const [debut, lignes, sous] = TEMPS_E[i];
  const panne = i === 1;
  $('#sE .direct i').style.background = tc >= TEMPS_E[1][0] ? 'var(--crit)' : 'var(--ok)';
  const titre = $('#sE .titre');
  titre.style.color = panne ? 'var(--crit)' : 'var(--ivoire)';
  ['.l1', '.l2'].forEach((sel, j) => {
    const m = $(`#sE ${sel}`);
    m.firstElementChild.textContent = lignes[j];
    lever(m, p(tc, debut + j * 0.11, 0.42));
  });
  const s = $('#sE .sous');
  s.textContent = sous;
  const ks = sortir(p(tc, debut + 0.3, 0.4));
  s.style.opacity = String(ks);
  s.style.transform = `translateY(${(1 - ks) * 12}px)`;
  // Le trajet de l'alarme, de l'atelier à l'écran : il se remplit juste avant qu'elle n'apparaisse.
  const depart = TEMPS_E[1][0] - 0.85;
  [...document.querySelectorAll('#sE .chaine li')].forEach((li, j) => li.classList.toggle('on', tc >= depart + j * 0.28));
  $('#sE .fil b').style.transform = `scaleY(${p(tc, depart, 0.84)})`;
  // L'application : la carte entre en perspective, avance lentement, et son cadre bat quand la panne tombe.
  const carte = $('#sE .carte');
  const k = sortir(p(t, 0, 0.7));
  carte.style.opacity = String(cl(k * 1.5));
  carte.style.transform = `translate3d(${(1 - k) * 380}px,0,${(1 - k) * -240}px) rotateY(${melange(-30, -5, k)}deg) rotateX(2deg) scale(${1 + 0.02 * (t / D.E)})`;
  carte.style.borderColor = panne ? 'var(--crit)' : 'var(--trait)';
  const onde = panne ? ((tc - debut) % 0.9) / 0.9 : 0;
  const u = $('#sE .vue u');
  u.style.opacity = panne ? String(0.8 * (1 - onde)) : '0';
  u.style.transform = `rotateY(-5deg) rotateX(2deg) scale(${1 + onde * 0.035})`;
  const f = Math.min(nClip, Math.max(1, Math.round(tc * IPS) + 1));
  return poser($('#clip'), `/clips/panne/f${String(f).padStart(4, '0')}.jpg`);
}

// G. Les chiffres : un grand nombre à la fois, avec ce qu'il compte dessiné à côté, puis les six ensemble
const ECRANS = ['Localiser', 'Plan', 'Machines', 'Organes', 'Connexion', 'Supervision', 'Historique', 'Maintenance', 'Énergie', 'Vue d’ensemble'];
const PROTOCOLES = ['OPC UA', 'Modbus TCP', 'Siemens S7', 'JDF / JMF', 'MQTT'];
const numero = (i) => String(i + 1).padStart(2, '0');
const rangees = (classe, compte) => machines.map((m) => `<div class="rg"><span class="mono">${m.def.nom}</span><div class="${classe}">${'<i class="e"></i>'.repeat(compte(m))}</div></div>`).join('');
/** [nombre, libellé, dessin à droite, écart entre deux apparitions (s)] */
const TEMPS_G = [
  [8, 'machines modélisées en 3D', () => '', 0],
  [43, 'organes surveillés', () => rangees('pts', (m) => m.organes), 0.013],
  [113, 'mesures suivies', () => rangees('tks', (m) => m.mesures), 0.005],
  [5, 'protocoles d’automate', () => `<ol class="liste">${PROTOCOLES.map((x, i) => `<li class="e"><b>${numero(i)}</b>${x}</li>`).join('')}</ol>`, 0.08],
  [10, 'écrans', () => `<ol class="deux">${ECRANS.map((x, i) => `<li class="e"><b>${numero(i)}</b>${x}</li>`).join('')}</ol>`, 0.045],
  [2, 'usines', () => '<div class="usine e"><strong>Tours</strong><span>ZI du Menneton</span></div><div class="usine e"><strong>Crissey</strong><span>Ateliers Brennac</span></div>', 0.16],
];
const PAS_CHIFFRE = 1.05;
function sceneG(t, tAbs) {
  const recap = t >= TEMPS_G.length * PAS_CHIFFRE;
  const i = Math.min(TEMPS_G.length - 1, Math.floor(t / PAS_CHIFFRE));
  const u = t - i * PAS_CHIFFRE;
  const avec3d = !recap && i === 0;
  montrer('G', avec3d);
  for (const sel of ['.gros', '.lib', '#gV']) $(`#sG ${sel}`).style.display = recap ? 'none' : '';
  const grille = $('#sG .recap');
  grille.style.display = recap ? 'grid' : 'none';
  if (recap) {
    const v = t - TEMPS_G.length * PAS_CHIFFRE;
    if (!grille.childElementCount) grille.innerHTML = TEMPS_G.map(([n, l]) => `<div class="c"><b>${n}</b><span>${l}</span></div>`).join('');
    [...grille.children].forEach((c, j) => {
      const k = sortir(p(v, 0.05 + j * 0.07, 0.4));
      c.style.opacity = String(k);
      c.style.transform = `translateY(${(1 - k) * 30}px)`;
    });
    return;
  }
  const [n, libelle, dessin, ecart] = TEMPS_G[i];
  $('#gN').textContent = String(Math.round(n * sortir(p(u, 0, 0.55))));
  lever($('#sG .gros'), p(u, 0, 0.4));
  $('#gL').textContent = libelle;
  lever($('#sG .lib'), p(u, 0.12, 0.4));
  const gv = $('#gV');
  if (gv.dataset.temps !== String(i)) { gv.dataset.temps = String(i); gv.innerHTML = dessin(); }
  [...gv.querySelectorAll('.e')].forEach((e, j) => {
    const k = sortir(p(u, 0.14 + j * ecart, 0.26));
    e.style.opacity = String(k);
    e.style.transform = ecart > 0.03 ? `translateX(${(1 - k) * 26}px)` : `scale(${k})`;
  });
  if (avec3d) {
    // Les 8 machines du kit, à droite du nombre.
    const k = sortir(p(u, 0, PAS_CHIFFRE));
    placer('rangs');
    eclairer(1);
    cadrer({ x: 0, y: 0.6, z: 0, d: melange(96, 88, k), az: melange(0.4, 0.26, k), el: 0.44, decale: [-260, -30], ombre: 34 });
    animer(machines, tAbs);
    rendu.render(scene, camera);
  }
}

// H. Fin
function sceneH(t) {
  montrer('H', false);
  document.documentElement.style.setProperty('--etat', 'var(--ok)');
  const k = sortir(p(t, 0.1, 0.6));
  const logo = $('#logoH');
  logo.style.opacity = String(k);
  logo.style.transform = `scale(${melange(0.9, 1, k)})`;
  lever($('#sH p'), p(t, 0.55, 0.55));
}

async function aller(f) {
  const t = f / IPS;
  if (t < T.B) sceneA(t, t);
  else if (t < T.C) await sceneCartes(t - T.B, CONFIG, 'Configurer, en cinq étapes');
  else if (t < T.Dd) sceneC(t - T.C, t);
  else if (t < T.E) sceneD(t - T.Dd, t);
  else if (t < T.F) await sceneE(t - T.E);
  else if (t < T.G) await sceneCartes(t - T.F, EXPLOITER, 'Exploiter');
  else if (t < T.Hh) sceneG(t - T.G, t);
  else sceneH(t - T.Hh);
}

const pret = (async () => {
  const [kit, demo, logo, clip] = await Promise.all([
    fetch('/kit/machines.json').then((r) => r.json()),
    fetch('/donnees/demo.json').then((r) => r.json()),
    fetch('/media/titre-sombre.svg').then((r) => r.text()),
    fetch('/clips/panne/n.json').then((r) => r.json()),
  ]);
  nClip = clip.n;
  const svg = logo.replace(/<style>[\s\S]*?<\/style>/, '').replace(/<title>[\s\S]*?<\/title>/, '').replace(/ width="\d+" height="\d+"/, '');
  $('#logoA').innerHTML = svg;
  $('#logoH').innerHTML = svg;
  for (const def of kit.machines) machines.push(await chargerMachine(def));
  monterAtelier(demo);
  await Promise.all([...CONFIG, ...EXPLOITER].map(([n]) => charger(`/ecrans/${n}.jpg`)));
  await Promise.all([document.fonts.load('600 40px Plex'), document.fonts.load('500 20px PlexMono'), document.fonts.load('400 20px PlexMono')]);
  // Une première image de chaque disposition : compile les matériaux et monte les textures avant le rendu.
  for (const mode of ['atelier', 'ligne']) { placer(mode); eclairer(1); cadrer({ x: 0, y: 1, z: 0, d: 60, az: 0.5, el: 0.5 }); rendu.render(scene, camera); }
})();

window.film = { aller, pret, images: Math.round(T.fin * IPS), ips: IPS, T };
