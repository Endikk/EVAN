import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getBounds, NodeIO, type Document, type Node } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import kit from '@data/kit/machines.json';
import catalogue from '@data/catalog.json';
import { diagNodeName, MODEL_FOOTPRINT, slug } from '../src/domain/catalog';

/**
 * Contrat des modèles 3D du kit (data/kit/README.md) : ce que l'application lit dans chaque .glb, vérifié contre
 * machines.json. Il tient pour les modèles construits dans Blender (data/kit/blender/) comme pour ceux d'avant.
 */
const dossier = fileURLToPath(new URL('../../../data/kit/modeles/', import.meta.url));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

/** Ce que la fusion du plan d'usine (widgets/scene/mergedModel.ts) sait regrouper. */
const ATTRIBUTS = ['POSITION', 'NORMAL', 'TEXCOORD_0'];

/** Ce que le catalogue dit de chaque organe : ses mesures, et les cylindres que l'analyse des défauts répétitifs connaît. */
interface OrganeCatalogue {
  mesures?: { cle: string; libelle: string }[];
  cylindres?: { nom: string; diametre?: number; developpement?: number }[];
}
const types = (catalogue as unknown as { types: Record<string, { organes: Record<string, OrganeCatalogue> }> }).types;

/**
 * Distance au point de diagnostic au-delà de laquelle un capteur ou un cylindre n'appartient plus à son organe (m).
 * Large à dessein : un organe comme « pupitre et automate » ou « séchage » couvre l'armoire du bâti ou toute une
 * rangée de lampes, et le point de diagnostic n'en marque qu'un endroit. Le rattachement exact passe par l'extra
 * `organe` du capteur, que le test vérifie aussi.
 */
const PORTEE_ORGANE = 1.5;

/** Diamètre d'un rouleau, mesuré sur son propre maillage dans le plan perpendiculaire à son axe (mm). */
function diametreMm(n: Node): number {
  const m = n.getWorldMatrix();
  const axe = axeY(n);
  let max = 0;
  for (const p of n.getMesh()?.listPrimitives() ?? []) {
    const pos = p.getAttribute('POSITION')!;
    const v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      const w = [0, 1, 2].map((k) => m[k] * v[0] + m[4 + k] * v[1] + m[8 + k] * v[2]);
      const le_long = w[0] * axe[0] + w[1] * axe[1] + w[2] * axe[2];
      max = Math.max(max, Math.hypot(w[0] - le_long * axe[0], w[1] - le_long * axe[1], w[2] - le_long * axe[2]));
    }
  }
  return 2 * max * 1000;
}

/** Direction du monde où pointe l'axe Y local d'un nœud (deuxième colonne de sa matrice). */
function axeY(n: Node): [number, number, number] {
  const m = n.getWorldMatrix();
  const l = Math.hypot(m[4], m[5], m[6]);
  return [m[4] / l, m[5] / l, m[6] / l];
}

describe.each(kit.machines.map((m) => [m.id, m] as const))('modèle 3D %s', (id, machine) => {
  let doc: Document;
  let noeuds: Node[];
  const nomme = (nom: string) => noeuds.find((n) => n.getName() === nom);

  beforeAll(async () => {
    doc = await io.readBinary(new Uint8Array(readFileSync(`${dossier}${id}.glb`)));
    noeuds = doc.getRoot().listNodes();
  });

  it('place un point de diagnostic par organe, là où machines.json le situe', () => {
    for (const p of machine.points_diagnostic) {
      const n = nomme(diagNodeName(p));
      expect(n, diagNodeName(p)).toBeDefined();
      expect(n!.getExtras()).toMatchObject({ numero: p.numero, nom: p.nom });
      n!.getWorldTranslation().forEach((v, i) => expect(v, `${diagNodeName(p)}[${i}]`).toBeCloseTo(p.position[i], 2));
    }
  });

  it('porte ses repères de légende', () => {
    for (const r of machine.reperes ?? []) {
      const n = nomme(`repere_${slug(r.texte)}`);
      expect(n, r.texte).toBeDefined();
      expect(n!.getExtras()).toMatchObject({ texte: r.texte });
    }
  });

  it('a une colonne lumineuse à trois voyants', () => {
    for (const nom of ['voyant_vert', 'voyant_orange', 'voyant_rouge']) {
      expect(nomme(nom)?.getExtras(), nom).toMatchObject({ role: 'voyant' });
    }
  });

  it('fait tourner chaque rouleau autour de son axe, couché vers l’avant', () => {
    const rotatifs = noeuds.filter((n) => n.getExtras().role === 'rotatif');
    expect(rotatifs.length).toBeGreaterThan(0);
    for (const n of rotatifs) {
      expect(Number.isFinite(n.getExtras().vitesseRadS), n.getName()).toBe(true);
      // L'animation tourne autour de Y local : un rouleau doit avoir cet axe à l'horizontale, en travers de la bande.
      expect(Math.abs(axeY(n)[2]), n.getName()).toBeGreaterThan(0.99);
    }
  });

  it('fait défiler des bandes texturées', () => {
    const bandes = noeuds.filter((n) => n.getExtras().role === 'bande');
    for (const n of bandes) {
      expect(n.getExtras(), n.getName()).toMatchObject({ vitesseMS: expect.any(Number), pasEtiquetteM: expect.any(Number) });
      const mats = (n.getMesh()?.listPrimitives() ?? []).map((p) => p.getMaterial());
      expect(mats.some((m) => m?.getBaseColorTexture()), n.getName()).toBe(true);
    }
  });

  it('tient dans son emprise au sol (MODEL_FOOTPRINT)', () => {
    const e = MODEL_FOOTPRINT[id];
    const { min, max } = getBounds(doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]);
    const marge = 0.02;
    expect(min[0]).toBeGreaterThanOrEqual(e.min[0] - marge);
    expect(min[2]).toBeGreaterThanOrEqual(e.min[1] - marge);
    expect(max[0]).toBeLessThanOrEqual(e.max[0] + marge);
    expect(max[2]).toBeLessThanOrEqual(e.max[1] + marge);
    expect(max[1]).toBeLessThanOrEqual(e.h + marge);
  });

  it('porte un capteur pour chaque mesure du catalogue, sur son organe', () => {
    const manquants: string[] = [];
    for (const [numero, organe] of Object.entries(types[id].organes)) {
      const point = machine.points_diagnostic.find((p) => p.numero === Number(numero))!;
      for (const mesure of organe.mesures ?? []) {
        const capteur = noeuds.find((n) => {
          const e = n.getExtras();
          return e.role === 'capteur' && String(e.organe) === numero && String(e.mesure).split(',').includes(mesure.cle);
        });
        if (!capteur) manquants.push(`organe ${numero} : ${mesure.libelle} (${mesure.cle})`);
        else {
          const d = Math.hypot(...capteur.getWorldTranslation().map((v, i) => v - point.position[i]));
          if (d > PORTEE_ORGANE) manquants.push(`organe ${numero} : ${mesure.libelle}, capteur à ${d.toFixed(2)} m de l'organe`);
        }
      }
    }
    expect(manquants).toEqual([]);
  });

  it('a chaque cylindre du catalogue, au diamètre du catalogue', () => {
    const ecarts: string[] = [];
    for (const [numero, organe] of Object.entries(types[id].organes)) {
      const point = machine.points_diagnostic.find((p) => p.numero === Number(numero))!;
      for (const cyl of organe.cylindres ?? []) {
        const attendu = cyl.diametre ?? (cyl.developpement ?? 0) / Math.PI;
        const n = noeuds.find((x) => x.getExtras().cylindre === cyl.nom);
        if (!n) {
          ecarts.push(`organe ${numero} : ${cyl.nom} absent`);
          continue;
        }
        const mesure = diametreMm(n);
        if (Math.abs(mesure - attendu) > Math.max(2, attendu * 0.02)) ecarts.push(`${cyl.nom} : ${mesure.toFixed(1)} mm au lieu de ${attendu.toFixed(1)}`);
        const d = Math.hypot(...n.getWorldTranslation().map((v, i) => v - point.position[i]));
        if (d > PORTEE_ORGANE) ecarts.push(`${cyl.nom} à ${d.toFixed(2)} m de l'organe ${numero}`);
      }
    }
    expect(ecarts).toEqual([]);
  });

  it('a un écran texturé, que les pupitres et les postes affichent', () => {
    const ecrans = noeuds.filter((n) => n.getExtras().role === 'ecran');
    expect(ecrans.length).toBeGreaterThan(0);
    for (const n of ecrans) {
      const mats = (n.getMesh()?.listPrimitives() ?? []).map((p) => p.getMaterial());
      expect(mats.some((m) => m?.getBaseColorTexture()?.getSize()?.[0] === 1024), n.getName()).toBe(true);
    }
  });

  it('ne porte que position, normale et UV, en flottants', () => {
    for (const m of doc.getRoot().listMeshes()) {
      for (const p of m.listPrimitives()) {
        for (const s of p.listSemantics()) {
          expect(ATTRIBUTS, `${m.getName()} ${s}`).toContain(s);
          expect(p.getAttribute(s)!.getArray(), `${m.getName()} ${s}`).toBeInstanceOf(Float32Array);
        }
      }
    }
  });
});
