// Écrans des machines du kit : pupitres d'atelier et postes informatiques, dessinés en SVG puis rendus en PNG par sharp.
//   node data/kit/blender/textures/sources/ecrans.cjs data/kit/blender/textures
//
// Chaque image remplace la texture d'écran d'une machine sous le même nom de fichier : les scripts Blender ne changent
// pas. Les valeurs affichées sont les nominales de data/catalog.json, celles que l'application simule : un écran ne
// dit rien que l'application ne dise aussi. Aucune marque, aucun logo de constructeur.
//
// Les zones vivantes des deux écrans de la flexo (vitesse, tendance, état) sont repeintes par l'accueil
// (src/EVAN.Front/src/pages/landing/features/EcransPresse.tsx) : leurs coordonnées sont dans ZONES, à garder
// identiques des deux côtés.
const path = require('path');
const fs = require('fs');
// sharp vient des dépendances du front : pas de package.json à part pour quelques images.
const sharp = require(path.join(__dirname, '..', '..', '..', '..', '..', 'src', 'EVAN.Front', 'node_modules', 'sharp'));

const catalogue = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'catalog.json'), 'utf8')).types;
const kit = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'machines.json'), 'utf8')).machines;
const sortie = process.argv[2];
if (!sortie) {
  console.error('usage : node ecrans.cjs <dossier des textures>');
  process.exit(1);
}
fs.mkdirSync(sortie, { recursive: true });
const L = 1024;
const H = 640;
// Police système de macOS, où ce script est lancé ; sur un système sans Arial, librsvg prendrait une autre police et les
// zones repeintes par l'accueil ne tomberaient plus juste.
const POLICE = 'Arial, Helvetica, sans-serif';
const C = {
  fond: '#121a23', panneau: '#1a2531', bord: '#2b3b4c', titre: '#0b1219', texte: '#e6edf3', doux: '#8fa3b5',
  accent: '#4fb3d1', vert: '#2fd07f', ambre: '#f2b134', rouge: '#ff3d6e', bandeau: '#0d6a85',
};
const ZONES = {
  vitesse: { x: 664, y: 64, w: 344, h: 132 },
  tendance: { x: 16, y: 424, w: 992, h: 132 },
  etat: { x: 16, y: 564, w: 992, h: 28 },
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nombre = (v) => (typeof v === 'number' ? v.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : v);
const texte = (x, y, t, taille, couleur = C.texte, opts = '') =>
  `<text x="${x}" y="${y}" font-family="${POLICE}" font-size="${taille}" fill="${couleur}" ${opts}>${esc(t)}</text>`;
const rect = (x, y, w, h, fill, opts = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${opts}/>`;

/** Mesure du catalogue : libellé, nominale, unité. Une détection sans unité (bourrage, casse) se lit « OK » au repos. */
function mesure(machine, organe, cle) {
  const m = catalogue[machine].organes[organe].mesures.find((x) => x.cle === cle);
  if (!m) throw new Error(`${machine} ${organe} ${cle}`);
  return { libelle: m.libelle, valeur: !m.unite && !m.nominal ? 'OK' : m.nominal, unite: m.unite };
}

/** Pas de graduation lisible (1, 2, 2,5, 4, 5 ou 7,5 fois une puissance de dix) pour couvrir `brut`. */
function pasRond(brut) {
  const p = 10 ** Math.floor(Math.log10(brut));
  return [1, 2, 2.5, 4, 5, 7.5, 10].map((k) => k * p).find((v) => v >= brut);
}

/** Caractéristiques de la fiche machines.json, en une ligne : ce qui est vrai de la machine, rien d'autre. */
function fiche(machine, cles) {
  const c = kit.find((m) => m.id === machine).caracteristiques ?? {};
  return cles.filter((k) => c[k]).map((k) => `${k} : ${c[k]}`).join('   ·   ');
}

// --- Pupitre d'atelier --------------------------------------------------------------------------------------------

function entete(titre, sousTitre, heure = '14:32') {
  return [
    rect(0, 0, L, 48, C.titre),
    rect(16, 12, 24, 24, C.bandeau, 'rx="4"'),
    texte(52, 22, titre, 17, C.texte, 'font-weight="700"'),
    texte(52, 40, sousTitre, 12, C.doux),
    rect(470, 12, 84, 24, '#163d2a', 'rx="12"'),
    `<circle cx="486" cy="24" r="5" fill="${C.vert}"/>`,
    texte(498, 29, 'AUTO', 13, C.vert, 'font-weight="700"'),
    texte(590, 29, 'Conducteur', 13, C.doux),
    `<circle cx="700" cy="24" r="4" fill="${C.vert}"/>`,
    texte(710, 29, 'Automate', 12, C.doux),
    `<circle cx="790" cy="24" r="4" fill="${C.vert}"/>`,
    texte(800, 29, 'Réseau', 12, C.doux),
    texte(L - 16, 31, heure, 18, C.texte, 'text-anchor="end" font-weight="700"'),
  ].join('');
}

function panneau(x, y, w, h, titre) {
  return rect(x, y, w, h, C.panneau, `rx="6" stroke="${C.bord}"`) + (titre ? texte(x + 14, y + 22, titre.toUpperCase(), 11, C.doux, 'letter-spacing="1"') : '');
}

/** Grande tuile de vitesse, avec la jauge rapportée au maximum de la machine. */
function vitesse(machine) {
  const v = catalogue[machine].vitesse;
  const z = ZONES.vitesse;
  return [
    panneau(z.x, z.y, z.w, z.h, 'Vitesse'),
    texte(z.x + 14, z.y + 86, nombre(v.nominale), 58, C.texte, 'font-weight="700"'),
    texte(z.x + 14 + String(v.nominale).length * 33 + 10, z.y + 86, v.unite, 16, C.doux),
    rect(z.x + 14, z.y + 104, z.w - 28, 10, C.bord, 'rx="5"'),
    rect(z.x + 14, z.y + 104, (z.w - 28) * (v.nominale / v.max), 10, C.accent, 'rx="5"'),
    texte(z.x + z.w - 14, z.y + 128, `max ${nombre(v.max)}`, 11, C.doux, 'text-anchor="end"'),
  ].join('');
}

/** Petites tuiles de mesures, deux par ligne, sous la vitesse. */
function tuiles(machine, liste) {
  const parties = [];
  liste.forEach(([organe, cle, court], i) => {
    const m = mesure(machine, organe, cle);
    const x = 664 + (i % 2) * 176;
    const y = 204 + Math.floor(i / 2) * 72;
    parties.push(panneau(x, y, 168, 64));
    parties.push(rect(x, y + 8, 3, 48, C.vert));
    parties.push(texte(x + 14, y + 22, court || m.libelle, 11, C.doux));
    parties.push(texte(x + 14, y + 50, nombre(m.valeur), 24, C.texte, 'font-weight="700"'));
    parties.push(texte(x + 14 + String(nombre(m.valeur)).length * 14 + 6, y + 50, m.unite, 12, C.doux));
  });
  return parties.join('');
}

/** Synoptique de la ligne : bobines, postes en boîtes, bande qui les traverse. */
function synoptique(postes, info, { x = 16, y = 64, w = 632, h = 344 } = {}) {
  const p = [panneau(x, y, w, h, 'Synoptique de la ligne')];
  if (info) p.push(texte(x + 14, y + 44, info.length > 96 ? `${info.slice(0, 95)}…` : info, 11, C.texte));
  const yb = y + h / 2 + 22;
  const n = postes.length;
  const pas = (w - 40) / n;
  p.push(`<line x1="${x + 20}" y1="${yb}" x2="${x + w - 20}" y2="${yb}" stroke="#d9e2ea" stroke-width="3"/>`);
  postes.forEach((poste, i) => {
    const cx = x + 20 + pas * (i + 0.5);
    if (poste.bobine) {
      p.push(`<circle cx="${cx}" cy="${yb - 34}" r="30" fill="#e8e2d0" stroke="${C.bord}" stroke-width="2"/>`);
      p.push(`<circle cx="${cx}" cy="${yb - 34}" r="7" fill="#8b6a45"/>`);
    } else {
      const bw = Math.min(pas - 8, 58);
      p.push(rect(cx - bw / 2, yb - 64, bw, 98, '#22313f', `rx="4" stroke="${C.bord}"`));
      if (poste.couleur) p.push(rect(cx - bw / 2 + 6, yb - 56, bw - 12, 10, poste.couleur, 'rx="2"'));
      p.push(`<circle cx="${cx}" cy="${yb + 2}" r="9" fill="#9aa9b6"/>`);
      p.push(`<circle cx="${cx}" cy="${yb - 20}" r="9" fill="#5f6f7d"/>`);
    }
    p.push(`<circle cx="${cx}" cy="${yb + 54}" r="5" fill="${C.vert}"/>`);
    p.push(texte(cx, yb + 78, poste.nom, 11, C.texte, 'text-anchor="middle"'));
  });
  return p.join('');
}

/** Tendance de la vitesse sur 15 minutes : la courbe reste à la nominale, comme la simulation au repos. */
function tendance(machine) {
  const z = ZONES.tendance;
  const v = catalogue[machine].vitesse;
  const p = [panneau(z.x, z.y, z.w, z.h, `Vitesse, 15 dernières minutes (${v.unite})`)];
  const pas = pasRond(v.max / 4);
  const haut = pas * 4;
  for (let k = 0; k <= 4; k++) {
    const y = z.y + 32 + k * 22;
    p.push(`<line x1="${z.x + 44}" y1="${y}" x2="${z.x + z.w - 14}" y2="${y}" stroke="${C.bord}" stroke-width="1"/>`);
    p.push(texte(z.x + 38, y + 4, nombre(haut - k * pas), 10, C.doux, 'text-anchor="end"'));
  }
  const y0 = z.y + 32 + 88 * (1 - v.nominale / haut);
  p.push(`<line x1="${z.x + 44}" y1="${y0}" x2="${z.x + z.w - 14}" y2="${y0}" stroke="${C.accent}" stroke-width="2.5"/>`);
  return p.join('');
}

function etat(message = 'Aucune alarme active') {
  const z = ZONES.etat;
  return [
    rect(z.x, z.y, z.w, z.h, '#163d2a', 'rx="4"'),
    `<circle cx="${z.x + 16}" cy="${z.y + 14}" r="6" fill="${C.vert}"/>`,
    texte(z.x + 30, z.y + 19, message, 13, C.texte),
    texte(z.x + z.w - 12, z.y + 19, 'Journal des alarmes', 12, C.doux, 'text-anchor="end"'),
  ].join('');
}

function navigation(onglets, actif = 0) {
  const w = (L - 32 - (onglets.length - 1) * 8) / onglets.length;
  return onglets
    .map((o, i) => {
      const x = 16 + i * (w + 8);
      const fond = i === actif ? C.bandeau : '#1f2c39';
      return rect(x, 600, w, 32, fond, `rx="4" stroke="${C.bord}"`) + texte(x + w / 2, 621, o, 13, i === actif ? '#fff' : C.doux, 'text-anchor="middle"');
    })
    .join('');
}

const NAV = ['Production', 'Réglages', 'Recettes', 'Alarmes', 'Maintenance', 'Utilisateur'];

function pupitre({ machine, titre, sousTitre, postes, mesures, nav = NAV, info = '' }) {
  return [rect(0, 0, L, H, C.fond), entete(titre, sousTitre), synoptique(postes, info), vitesse(machine), tuiles(machine, mesures),
    tendance(machine), etat(), navigation(nav)].join('');
}

// --- Poste informatique (fenêtre de logiciel) ----------------------------------------------------------------------

const W = { fond: '#f3f4f6', barre: '#ffffff', bord: '#d4d8dd', texte: '#1d2733', doux: '#5d6b79', accent: '#1f6fb2' };

function fenetre(titre, menus) {
  const p = [rect(0, 0, L, H, '#2b4a63'), rect(0, 0, L, H - 34, W.fond), rect(0, 0, L, 30, W.barre)];
  p.push(texte(12, 20, titre, 13, W.texte));
  [['–', L - 120], ['□', L - 76], ['×', L - 32]].forEach(([s, x]) => p.push(texte(x, 21, s, 15, W.doux, 'text-anchor="middle"')));
  p.push(rect(0, 30, L, 26, '#eef0f3'), `<line x1="0" y1="56" x2="${L}" y2="56" stroke="${W.bord}"/>`);
  let x = 12;
  for (const m of menus) {
    p.push(texte(x, 48, m, 12, W.texte));
    x += m.length * 7 + 22;
  }
  p.push(rect(0, 56, L, 36, W.barre), `<line x1="0" y1="92" x2="${L}" y2="92" stroke="${W.bord}"/>`);
  for (let i = 0; i < 9; i++) p.push(rect(12 + i * 34 + (i > 3 ? 12 : 0), 63, 24, 22, i === 4 ? '#dbe8f5' : '#e4e7eb', 'rx="3"'));
  // Barre des tâches du système, en bas de l'écran.
  p.push(rect(0, H - 34, L, 34, '#1e2a36'), rect(10, H - 26, 18, 18, '#4fb3d1', 'rx="3"'));
  p.push(texte(L - 14, H - 12, '14:32', 12, '#dfe6ec', 'text-anchor="end"'));
  return p.join('');
}

function tableau(x, y, colonnes, lignes, largeurs) {
  const p = [rect(x, y, largeurs.reduce((a, b) => a + b, 0), 24, '#e6e9ed')];
  let cx = x;
  colonnes.forEach((c, i) => {
    p.push(texte(cx + 8, y + 16, c, 11, W.doux, 'font-weight="700"'));
    cx += largeurs[i];
  });
  lignes.forEach((l, j) => {
    const ly = y + 24 + j * 22;
    if (j % 2) p.push(rect(x, ly, largeurs.reduce((a, b) => a + b, 0), 22, '#f7f8fa'));
    cx = x;
    l.forEach((v, i) => {
      const couleur = v === 'OK' || v === 'Encodée' || v === 'Validé' ? '#1b8a4c' : W.texte;
      p.push(texte(cx + 8, ly + 15, v, 11, couleur));
      cx += largeurs[i];
    });
  });
  return p.join('');
}

function codeBarres(x, y, w, h) {
  const p = [];
  let cx = x;
  let k = 7;
  while (cx < x + w) {
    k = (k * 31 + 11) % 97;
    const lb = 1 + (k % 3);
    p.push(rect(cx, y, lb, h, '#111'));
    cx += lb + 1 + (k % 2);
  }
  return p.join('');
}

/** Étiquette dessinée : bandeau, lignes de texte, code-barres, et le symbole de la puce RFID si `puce`. */
function etiquette(x, y, w, h, { couleur = '#0a8fc2', puce = false } = {}) {
  const p = [rect(x, y, w, h, '#ffffff', `stroke="${W.bord}" rx="6"`), rect(x, y, w, h * 0.16, couleur, 'rx="6"')];
  p.push(rect(x + 14, y + h * 0.26, w * 0.55, 10, '#2b3640'), rect(x + 14, y + h * 0.26 + 18, w * 0.4, 8, '#8796a3'));
  p.push(rect(x + 14, y + h * 0.26 + 32, w * 0.48, 8, '#8796a3'));
  p.push(codeBarres(x + 14, y + h * 0.62, w * 0.6, h * 0.24));
  if (puce) {
    p.push(rect(x + w * 0.72, y + h * 0.55, w * 0.2, h * 0.3, 'none', `stroke="${couleur}" stroke-width="3" rx="4"`));
    p.push(rect(x + w * 0.79, y + h * 0.65, w * 0.06, h * 0.1, couleur));
  }
  return p.join('');
}

// --- Les écrans ----------------------------------------------------------------------------------------------------

const ENCRES = ['#1d8fd1', '#cf2479', '#f2c511', '#1c1c1c', '#e8641b', '#2e9d4f', '#6c3fa0', '#efefec'];

const ECRANS = {
  'ecran_impression.png': () =>
    pupitre({
      machine: 'flexo', titre: 'Presse flexo 8 groupes', sousTitre: 'Impression · groupes 1 à 8, séchage UV',
      info: fiche('flexo', ['Laize', 'Procédé', 'Vitesse']),
      postes: [{ nom: 'Dérouleur', bobine: true }, ...ENCRES.map((c, i) => ({ nom: `G${i + 1}`, couleur: c }))],
      mesures: [[1, 'tension', 'Tension dérouleur'], [1, 'diametre', 'Diamètre bobine'], [3, 'viscosite'], [3, 'temperature'],
        [4, 'puissance_uv', 'Puissance UV'], [4, 'temperature_air', 'Air chaud']],
    }),
  'ecran_decoupe.png': () =>
    pupitre({
      machine: 'flexo', titre: 'Presse flexo 8 groupes', sousTitre: 'Finition · dorure, découpe, échenillage',
      info: fiche('flexo', ['Laize', 'Finition']),
      postes: [{ nom: 'Dorure' }, { nom: 'Découpe 1' }, { nom: 'Découpe 2' }, { nom: 'Découpe 3' }, { nom: 'Échenillage', bobine: true },
        { nom: 'Rembobineur', bobine: true }],
      mesures: [[6, 'pression', 'Pression P2'], [6, 'reperage', 'Repérage découpe'], [6, 'metres_outil', 'Mètres outil'],
        [5, 'tension_film', 'Tension film'], [7, 'tension_dechet', 'Tension déchet'], [8, 'tension', 'Tension rembobinage']],
    }),
  'offset_ecran.png': () =>
    pupitre({
      machine: 'offset', titre: 'Rotative offset 6 couleurs', sousTitre: 'Impression · encrage, mouillage, découpe',
      info: fiche('offset', ['Procédé']),
      postes: [{ nom: 'Dérouleur', bobine: true }, ...ENCRES.slice(0, 6).map((c, i) => ({ nom: `G${i + 1}`, couleur: c })),
        { nom: 'Découpe' }, { nom: 'Rembob.', bobine: true }],
      mesures: [[2, 'ph', 'pH mouillage'], [2, 'conductivite', 'Conductivité'], [3, 'densite', 'Densité G5'],
        [4, 'pression', 'Pression impression'], [5, 'puissance_uv', 'Puissance UV'], [1, 'tension', 'Tension bande']],
    }),
  'digital_ecran.png': () =>
    pupitre({
      machine: 'digital', titre: 'Presse numérique jet d’encre', sousTitre: 'Impression CMJN · séchage UV LED · finition',
      info: fiche('digital', ['Usage']),
      postes: [{ nom: 'Dérouleur', bobine: true }, { nom: 'C', couleur: ENCRES[0] }, { nom: 'M', couleur: ENCRES[1] },
        { nom: 'J', couleur: ENCRES[2] }, { nom: 'N', couleur: ENCRES[3] }, { nom: 'UV LED' }, { nom: 'Finition' },
        { nom: 'Rembob.', bobine: true }],
      mesures: [[2, 'temperature_tetes', 'Température têtes'], [2, 'niveau_magenta', 'Encre magenta'], [2, 'buses', 'Buses manquantes'],
        [3, 'puissance', 'Puissance UV LED'], [6, 'file', 'Travaux en file'], [4, 'reperage', 'Repérage découpe']],
      nav: ['Production', 'File des travaux', 'Têtes', 'Encres', 'Alarmes', 'Maintenance'],
    }),
  'slitter_ecran.png': () =>
    pupitre({
      machine: 'slitter', titre: 'Refendeuse-rembobineuse', sousTitre: 'Refente en 5 pistes · contrôle sur table lumineuse',
      info: fiche('slitter', ['Rôle']),
      postes: [{ nom: 'Bobine mère', bobine: true }, { nom: 'Table' }, { nom: 'Couteaux' }, { nom: 'Piste 1', bobine: true },
        { nom: 'Piste 3', bobine: true }, { nom: 'Piste 5', bobine: true }],
      mesures: [[1, 'tension', 'Tension bobine mère'], [1, 'diametre', 'Diamètre mère'], [4, 'tension', 'Tension par bobine'],
        [3, 'position_lames', 'Écart des lames'], [2, 'manquantes', 'Étiq. manquantes'], [3, 'usure_lame3', 'Usure lame 3']],
    }),
  'paravent_ecran.png': () =>
    pupitre({
      machine: 'paravent', titre: 'Ligne paravent', sousTitre: 'Perforation transversale · pliage en zigzag',
      info: fiche('paravent', ['Produits']),
      postes: [{ nom: 'Dérouleur', bobine: true }, { nom: 'Traction' }, { nom: 'Perforation' }, { nom: 'Sortie' }, { nom: 'Plieur' },
        { nom: 'Pile' }],
      mesures: [[3, 'plis', 'Plis par minute'], [2, 'decalage', 'Décalage perforation'], [2, 'usure_perforateur', 'Usure perforateur'],
        [1, 'tension', 'Tension de bande'], [1, 'diametre', 'Diamètre bobine'], [3, 'bourrage', 'Bourrage']],
    }),
  'sheeter_ecran.png': () =>
    pupitre({
      machine: 'sheeter', titre: 'Feuilleteuse planches A4', sousTitre: 'Coupe transversale · convoyeur · empileur',
      info: fiche('sheeter', ['Produits']),
      postes: [{ nom: 'Bobine', bobine: true }, { nom: 'Traction' }, { nom: 'Coupe' }, { nom: 'Convoyeur' }, { nom: 'Empileur' }],
      mesures: [[2, 'longueur', 'Longueur de feuille'], [3, 'hauteur_pile', 'Hauteur de pile'], [3, 'doubles', 'Doubles feuilles'],
        [2, 'usure_couteau', 'Usure du couteau'], [1, 'tension', 'Tension de bande'], [1, 'diametre', 'Diamètre bobine']],
    }),
  'ctp_ecran_graveur.png': () =>
    pupitre({
      machine: 'ctp', titre: 'Graveur de plaques', sousTitre: 'Exposition thermique · tambour externe',
      info: fiche('ctp', ['Rôle']),
      postes: [{ nom: 'Chargement' }, { nom: 'Tambour', bobine: true }, { nom: 'Sortie' }, { nom: 'Développeuse' }, { nom: 'Empileur' }],
      mesures: [[2, 'puissance_diode', 'Diode la plus faible'], [2, 'temperature', 'Température diodes'], [1, 'stock', 'Stock de plaques'],
        [3, 'temperature_bain', 'Température du bain'], [3, 'conductivite', 'Conductivité bain'], [4, 'file', 'Travaux en file']],
      nav: ['Production', 'File', 'Plaques', 'Laser', 'Alarmes', 'Maintenance'],
    }),
  'ctp_ecran_amalgame.png': () => {
    const p = [fenetre('Flux prépresse · Amalgame de la commande', ['Fichier', 'Édition', 'Affichage', 'Travaux', 'Plaques', 'Outils', 'Aide'])];
    p.push(rect(0, 92, 230, H - 126, '#ffffff'), `<line x1="230" y1="92" x2="230" y2="${H - 34}" stroke="${W.bord}"/>`);
    p.push(texte(12, 116, 'Travaux en file', 12, W.texte, 'font-weight="700"'));
    ['Étiquette vin rouge 90×120', 'Étiquette cosmétique 60×40', 'Étiquette traiteur 100×70', 'Étiquette vin blanc 90×120',
      'Étiquette miel 50×50', 'Étiquette jus 80×110'].forEach((t, i) => {
      if (i === 0) p.push(rect(6, 126 + i * 30, 218, 26, '#dbe8f5', 'rx="3"'));
      p.push(texte(14, 143 + i * 30, t, 11, W.texte));
    });
    p.push(rect(256, 112, 560, 470, '#ffffff', `stroke="${W.bord}"`), texte(268, 132, 'Plaque 1 / 4 · cyan', 11, W.doux));
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) p.push(etiquette(276 + k * 132, 146 + r * 106, 118, 94, { couleur: ENCRES[(r + k) % 6] }));
    p.push(rect(832, 112, 176, 470, '#ffffff', `stroke="${W.bord}"`), texte(844, 134, 'Propriétés', 12, W.texte, 'font-weight="700"'));
    [['Laize', '440 mm'], ['Développement', '381 mm'], ['Poses', '16'], ['Couleurs', '6'], ['Plaques', '6'], ['État', 'BAT validé']].forEach(([a, b], i) => {
      p.push(texte(844, 162 + i * 26, a, 11, W.doux), texte(996, 162 + i * 26, b, 11, W.texte, 'text-anchor="end"'));
    });
    p.push(texte(12, H - 46, 'Prêt · 6 travaux en file · plaques refaites ce mois : 2,1 %', 11, W.doux));
    return p.join('');
  },
  'ctp_ecran_bat.png': () => {
    const p = [fenetre('Bon à tirer · Étiquette vin rouge 90×120.pdf', ['Fichier', 'Affichage', 'Annotations', 'Validation', 'Aide'])];
    p.push(rect(0, 92, L, H - 126, '#525c66'));
    p.push(rect(312, 112, 400, 456, '#ffffff'));
    p.push(rect(332, 132, 360, 70, '#7a1f2b'), texte(512, 176, 'CUVÉE DU DOMAINE', 22, '#f3e6c4', 'text-anchor="middle" font-weight="700"'));
    p.push(texte(512, 240, 'Appellation contrôlée', 15, '#3b2a1e', 'text-anchor="middle"'));
    p.push(`<circle cx="512" cy="330" r="62" fill="none" stroke="#7a1f2b" stroke-width="4"/>`);
    p.push(texte(512, 338, '2026', 26, '#7a1f2b', 'text-anchor="middle" font-weight="700"'));
    p.push(texte(512, 430, '75 cl · 13 % vol.', 14, '#3b2a1e', 'text-anchor="middle"'), codeBarres(432, 470, 160, 60));
    p.push(rect(744, 112, 264, 140, '#ffffff', 'rx="4"'), texte(758, 136, 'Validation', 13, W.texte, 'font-weight="700"'));
    p.push(rect(758, 150, 236, 30, '#1b8a4c', 'rx="4"'), texte(876, 170, 'Bon à tirer validé', 13, '#fff', 'text-anchor="middle"'));
    p.push(texte(758, 206, 'Version 3 · couleurs contrôlées', 11, W.doux), texte(758, 226, 'Repérage et fonds perdus OK', 11, W.doux));
    return p.join('');
  },
  'rfid_ecran.png': () => {
    const p = [fenetre('Logiciel d’étiquetage · Encodage RFID · commande en cours', ['Fichier', 'Édition', 'Affichage', 'Données', 'Impression', 'RFID', 'Aide'])];
    p.push(rect(16, 108, 420, 300, '#ffffff', `stroke="${W.bord}"`), texte(28, 130, 'Modèle d’étiquette', 12, W.texte, 'font-weight="700"'));
    p.push(etiquette(56, 150, 340, 230, { couleur: '#0a8fc2', puce: true }));
    p.push(rect(452, 108, 556, 300, '#ffffff', `stroke="${W.bord}"`), texte(464, 130, 'Données variables et puce', 12, W.texte, 'font-weight="700"'));
    [['EPC (écrit)', '3034 257B F468 D740 0000 0A71'], ['Numéro de série', '000 2673'], ['Puissance RF', '24 dBm'],
      ['Température de la tête', '38 °C'], ['Lecture de contrôle', '99,6 %'], ['Échecs d’encodage', '0,4 %'], ['Cadence', '2 400 étiq./h']].forEach(([a, b], i) => {
      p.push(texte(468, 160 + i * 32, a, 12, W.doux), texte(990, 160 + i * 32, b, 12, W.texte, 'text-anchor="end" font-weight="700"'));
      p.push(`<line x1="468" y1="${168 + i * 32}" x2="990" y2="${168 + i * 32}" stroke="#eceef1"/>`);
    });
    p.push(texte(16, 432, 'Journal d’encodage', 12, W.texte, 'font-weight="700"'));
    p.push(tableau(16, 440, ['Heure', 'N° de série', 'EPC', 'Lecture', 'État'], [
      ['14:32:08', '000 2673', '3034 257B F468 D740 0000 0A71', 'OK', 'Encodée'],
      ['14:32:06', '000 2672', '3034 257B F468 D740 0000 0A70', 'OK', 'Encodée'],
      ['14:32:05', '000 2671', '3034 257B F468 D740 0000 0A6F', 'OK', 'Encodée'],
      ['14:32:03', '000 2670', '3034 257B F468 D740 0000 0A6E', 'OK', 'Encodée'],
    ], [120, 140, 420, 160, 152]));
    return p.join('');
  },
};

(async () => {
  for (const [nom, dessin] of Object.entries(ECRANS)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${H}">${dessin()}</svg>`;
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toFile(path.join(sortie, nom));
    console.log('ECRAN', nom);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
