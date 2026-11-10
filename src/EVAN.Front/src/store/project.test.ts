import { beforeEach, describe, expect, it } from 'vitest';
import type { Batiment, Machine, Site } from '@/domain/types';
import { hasSavedAssistant, listUsines, resumeAssistant, useProject } from './project';

/** localStorage minimal pour l'environnement node des tests. */
function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const site = (nom: string): Site => ({
  id: 'ignore',
  organisationId: 'ignore',
  nom,
  adresse: `${nom} (adresse)`,
  coordonnees: [3.0573, 50.6292],
  repere: { origin: [3.0573, 50.6292], angleDeg: 0 },
});

const batiment = (id: string): Batiment => ({
  id,
  siteId: 'ignore',
  nom: 'Bâtiment A',
  contour: [
    [3.0573, 50.6292],
    [3.0577, 50.6292],
    [3.0577, 50.6295],
    [3.0573, 50.6295],
  ],
  sigmas: [1, 1, 1, 1],
  hauteur: 8,
  niveaux: 1,
  source: 'manuel',
});

describe('organisation et usines', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
    useProject.getState().loadDemo();
  });

  it('la démo ouvre Valtiq sur Tours, avec Crissey à côté', () => {
    const s = useProject.getState();
    expect(s.organisation.nom).toContain('Valtiq');
    expect(s.usines.map((u) => u.id)).toEqual(['site-tours', 'site-crissey']);
    expect(s.activeId).toBe('site-tours');
    expect(s.site?.nom).toContain('Tours');
    expect(s.machines.some((m) => m.id === 'm-r01')).toBe(true);
  });

  it('changer d’usine déplie la suivante et garde les modifications de la précédente', () => {
    const { updateMachine, switchUsine } = useProject.getState();
    updateMachine('m-r01', { rotationDeg: 90 });
    switchUsine('site-crissey');
    const crissey = useProject.getState();
    expect(crissey.site?.adresse).toBe('48 rue Paul Sabatier, 71530 Crissey');
    expect(crissey.site?.passerelle).toBe('crissey-01');
    expect(crissey.machines.every((m) => m.id.startsWith('m-cr-'))).toBe(true);
    expect(Object.keys(crissey.connexions).every((id) => id.startsWith('m-cr-'))).toBe(true);
    useProject.getState().switchUsine('site-tours');
    expect(useProject.getState().machines.find((m) => m.id === 'm-r01')?.rotationDeg).toBe(90);
  });

  it('l’assistant demande un nom d’organisation, puis ajoute des usines', () => {
    useProject.getState().startAssistant();
    expect(useProject.getState().organisation.nom).toBe('');
    useProject.getState().setOrganisationNom('  Ateliers du Nord ');
    expect(useProject.getState().organisation.nom).toBe('Ateliers du Nord');

    // Tant que la première usine est vide, « ajouter » ne fait que la garder.
    const first = useProject.getState().activeId;
    expect(useProject.getState().addUsine()).toBe(first);

    useProject.getState().setSite(site('Lille'));
    useProject.getState().upsertBatiment(batiment('bat-1'));
    expect(useProject.getState().site?.id).toBe(first);
    expect(useProject.getState().site?.organisationId).toBe(useProject.getState().organisation.id);

    const second = useProject.getState().addUsine();
    expect(second).not.toBe(first);
    expect(useProject.getState().site).toBeNull();
    expect(useProject.getState().batiments).toEqual([]);
    expect(listUsines(useProject.getState()).map((u) => u.id)).toEqual([first, second]);

    // Revenir à la première sans avoir localisé la seconde : l'usine vide n'est pas conservée.
    useProject.getState().switchUsine(first);
    expect(useProject.getState().usines.map((u) => u.id)).toEqual([first]);
    expect(useProject.getState().batiments.map((b) => b.id)).toEqual(['bat-1']);
  });

  it('sauvegarde toutes les usines et reprend une sauvegarde à une seule usine (format v1)', async () => {
    useProject.getState().startAssistant();
    const { setOrganisationNom, setSite, upsertBatiment, addUsine, addMachine } = useProject.getState();
    setOrganisationNom('Ateliers du Nord');
    setSite(site('Lille'));
    upsertBatiment(batiment('bat-1'));
    addUsine();
    useProject.getState().setSite(site('Roubaix'));
    useProject.getState().upsertBatiment(batiment('bat-2'));
    addMachine({ id: 'm-1', batimentId: 'bat-2', type: 'digital', nom: 'Presse', numero: 'R01', position: [0, 0], rotationDeg: 0, modele: { url: '/kit/modeles/digital.glb' } } satisfies Machine);
    await new Promise((r) => setTimeout(r, 450));

    useProject.getState().loadDemo();
    resumeAssistant();
    const s = useProject.getState();
    expect(s.organisation.nom).toBe('Ateliers du Nord');
    expect(listUsines(s).map((u) => u.site?.nom)).toEqual(['Lille', 'Roubaix']);
    expect(s.site?.nom).toBe('Roubaix');
    expect(s.machines.map((m) => m.id)).toEqual(['m-1']);

    // Ancien format : une seule usine à la racine.
    localStorage.clear();
    localStorage.setItem('evan.assistant.v1', JSON.stringify({ organisation: { id: 'org-moi', nom: 'Mon entreprise' }, site: { ...site('Tours'), id: 'site-moi' }, batiments: [batiment('bat-x')], configure: true }));
    expect(hasSavedAssistant()).toBe(true);
    resumeAssistant();
    const v1 = useProject.getState();
    expect(v1.usines).toHaveLength(1);
    expect(v1.activeId).toBe('site-moi');
    expect(v1.configure).toBe(true);
    expect(v1.batiments.map((b) => b.id)).toEqual(['bat-x']);
    expect('organisation' in v1.usines[0]).toBe(false);
  });
});

describe('zone d’une machine déplacée', () => {
  const zone = (id: string, x0: number, x1: number) => ({
    id,
    batimentId: 'b1',
    nom: id,
    type: 'atelier' as const,
    polygone: [
      [x0, 0],
      [x1, 0],
      [x1, 10],
      [x0, 10],
    ] as [number, number][],
  });

  it('prend la zone où la machine arrive, et la perd hors de toute zone', () => {
    useProject.setState({
      zones: [zone('impression', 0, 10), zone('faconnage', 20, 30)],
      machines: [{ id: 'm1', batimentId: 'b1', zoneId: 'impression', type: 'custom', nom: 'R01', numero: 'R01', position: [5, 5], rotationDeg: 0, modele: { url: '', personnalise: true }, creeLe: 0 } as Machine],
    });

    useProject.getState().updateMachine('m1', { position: [25, 5] });
    expect(useProject.getState().machines[0].zoneId).toBe('faconnage');

    useProject.getState().updateMachine('m1', { position: [15, 5] });
    expect(useProject.getState().machines[0].zoneId).toBeUndefined();
  });

  it('garde la zone donnée explicitement', () => {
    useProject.setState({
      zones: [zone('impression', 0, 10)],
      machines: [{ id: 'm1', batimentId: 'b1', type: 'custom', nom: 'R01', numero: 'R01', position: [5, 5], rotationDeg: 0, modele: { url: '', personnalise: true }, creeLe: 0 } as Machine],
    });
    useProject.getState().updateMachine('m1', { position: [50, 5], zoneId: 'impression' });
    expect(useProject.getState().machines[0].zoneId).toBe('impression');
  });
});
