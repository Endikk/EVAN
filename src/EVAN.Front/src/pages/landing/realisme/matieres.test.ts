import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { classer, CLE_MATIERE, materiauPhysique, type Signature } from './matieres';

const base: Signature = { couleur: [0.5, 0.5, 0.5], metal: 0, rugosite: 0.5, opacite: 1, texture: false, emissif: false, eclaire: true, nom: '' };
const s = (r: Partial<Signature>): Signature => ({ ...base, ...r });

describe('classer', () => {
  it('laisse tels quels les écrans, voyants et ombre peinte (non éclairés ou émissifs)', () => {
    expect(classer(s({ eclaire: false }))).toBeNull();
    expect(classer(s({ emissif: true }))).toBeNull();
  });

  it('reconnaît les matières du kit à leur couleur, métal et rugosité', () => {
    expect(classer(s({ couleur: [0.72, 0.73, 0.71], rugosite: 0.42 }))).toBe('tole');
    expect(classer(s({ couleur: [0.02, 0.03, 0.03], metal: 0.12, rugosite: 0.46 }))).toBe('sombre');
    expect(classer(s({ couleur: [0.01, 0.01, 0.01], rugosite: 0.6 }))).toBe('caoutchouc');
    expect(classer(s({ couleur: [0.9, 0.91, 0.92], metal: 1, rugosite: 0.08 }))).toBe('chrome');
    expect(classer(s({ couleur: [0.58, 0.61, 0.65], metal: 0.95, rugosite: 0.24 }))).toBe('acier');
    expect(classer(s({ couleur: [0.92, 0.9, 0.85], rugosite: 0.8 }))).toBe('papier');
    expect(classer(s({ couleur: [0.43, 0.25, 0.1], rugosite: 0.85 }))).toBe('carton');
    expect(classer(s({ couleur: [0.66, 0, 0.16], rugosite: 0.22 }))).toBe('plastique');
    expect(classer(s({ opacite: 0.14 }))).toBe('verre');
  });

  it('distingue le sol de ses lignes de sécurité par le nom du socle', () => {
    expect(classer(s({ nom: 'socle_1', couleur: [0.58, 0.6, 0.61], rugosite: 0.86 }))).toBe('sol');
    expect(classer(s({ nom: 'socle_2', couleur: [0.87, 0.52, 0], rugosite: 0.5 }))).toBe('marquage');
  });

  it('fait passer la texture avant le métal (film de dorure, flancs de bobine)', () => {
    expect(classer(s({ texture: true, metal: 0.6, rugosite: 0.7 }))).toBe('imprime');
  });
});

describe('materiauPhysique', () => {
  it('garde couleur, texture et transparence du kit, et partage une seule clé de shader', () => {
    const map = new THREE.Texture();
    const source = new THREE.MeshStandardMaterial({ color: '#336699', map, transparent: true, opacity: 0.4 });
    const m = materiauPhysique('verre', source);
    expect(m.color.getHex()).toBe(source.color.getHex());
    expect(m.map).toBe(map);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBe(0.4);
    expect(m.customProgramCacheKey()).toBe(CLE_MATIERE);
  });

  it('relève un noir pur au plancher de sa classe', () => {
    const m = materiauPhysique('caoutchouc', new THREE.MeshStandardMaterial({ color: 0x000000 }));
    expect(m.color.r).toBeGreaterThan(0);
  });
});
