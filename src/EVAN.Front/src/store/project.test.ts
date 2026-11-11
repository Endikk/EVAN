import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Batiment, Connexion, Machine, Site, Zone } from '@/domain/types';
import { batimentSous, contenuBatiment, hasSavedAssistant, listUsines, resumeAssistant, retirerMachine, useProject, zoneSous } from './project';
import { useLive } from './live';

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

describe('niveaux d’un bâtiment', () => {
  const zone = (id: string, niveau?: number): Zone => ({
    id,
    batimentId: 'bat-a',
    nom: id,
    type: 'atelier',
    polygone: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    ...(niveau === undefined ? {} : { niveau }),
  });
  const machine = (id: string, patch: Partial<Machine> = {}): Machine => ({
    id,
    batimentId: 'bat-a',
    type: 'flexo',
    nom: 'Presse',
    numero: 'R01',
    position: [5, 5],
    rotationDeg: 0,
    modele: { url: '/kit/modeles/flexo.glb' },
    ...patch,
  });

  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
    useProject.getState().startAssistant();
    useProject.getState().setSite(site('Usine à étages'));
    useProject.getState().upsertBatiment({ ...batiment('bat-a'), niveaux: 3 });
  });

  it('deux zones superposées ne se confondent pas : chacune répond pour son niveau', () => {
    const zones = [zone('z-rdc'), zone('z-etage', 1)];
    expect(zoneSous(zones, [5, 5])?.id).toBe('z-rdc');
    expect(zoneSous(zones, [5, 5], 1)?.id).toBe('z-etage');
    expect(zoneSous(zones, [5, 5], 2)).toBeUndefined();
  });

  it('une machine qui change de niveau prend la zone de ce niveau', () => {
    const p = useProject.getState();
    p.addZone(zone('z-rdc'));
    p.addZone(zone('z-etage', 1));
    p.addMachine(machine('m-1', { zoneId: 'z-rdc' }));
    p.updateMachine('m-1', { niveau: 1 });
    expect(useProject.getState().machines[0]).toMatchObject({ niveau: 1, zoneId: 'z-etage' });
    p.updateMachine('m-1', { niveau: 2 });
    expect(useProject.getState().machines[0].zoneId).toBeUndefined();
  });

  it('une zone qui change de niveau emmène ses machines', () => {
    const p = useProject.getState();
    p.addZone(zone('z-rdc'));
    p.addMachine(machine('m-1', { zoneId: 'z-rdc' }));
    p.addMachine(machine('m-2'));
    p.updateZone('z-rdc', { niveau: 2 });
    const [m1, m2] = useProject.getState().machines;
    expect(m1.niveau).toBe(2);
    expect(m2.niveau).toBeUndefined();
  });

  it('on ne retire pas un niveau qui porte une zone ou une machine', () => {
    const p = useProject.getState();
    p.addMachine(machine('m-1', { niveau: 1 }));
    p.setNiveaux('bat-a', 1);
    expect(useProject.getState().batiments[0].niveaux).toBe(2);
    p.removeMachine('m-1');
    p.setNiveaux('bat-a', 1);
    expect(useProject.getState().batiments[0].niveaux).toBe(1);
  });

  it('annuler la pose d’une machine à l’étage garde l’étage, puis annuler l’étage le retire', () => {
    const p = useProject.getState();
    p.setNiveaux('bat-a', 1);
    p.pushHistory();
    p.setNiveaux('bat-a', 2);
    p.addMachine(machine('m-1', { niveau: 1 }));
    p.undo();
    expect(useProject.getState().machines).toEqual([]);
    expect(useProject.getState().batiments[0].niveaux).toBe(2);
    p.undo();
    expect(useProject.getState().batiments[0].niveaux).toBe(1);
  });

  it('une machine poussée hors des contours garde son bâtiment', () => {
    const p = useProject.getState();
    p.upsertBatiment({ ...batiment('bat-b'), niveaux: 1 });
    p.addMachine(machine('m-1', { batimentId: 'bat-b' }));
    p.updateMachine('m-1', { position: [9999, 9999] });
    expect(useProject.getState().machines[0].batimentId).toBe('bat-b');
  });

  it('un point à l’étage revient au bâtiment qui a cet étage', () => {
    const p = useProject.getState();
    p.upsertBatiment({ ...batiment('bat-b'), niveaux: 1 });
    const { site: s, batiments } = useProject.getState();
    expect(batimentSous(s, [batiments[1], batiments[0]], [1, 1], 1)?.id).toBe('bat-a');
    expect(batimentSous(s, batiments, [9999, 9999], 0)?.id).toBe('bat-a');
  });
});

describe('annuler et retirer', () => {
  const zone = (id: string, batimentId = 'bat-a'): Zone => ({
    id,
    batimentId,
    nom: id,
    type: 'atelier',
    polygone: [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
  });
  const machine = (id: string, patch: Partial<Machine> = {}): Machine => ({
    id,
    batimentId: 'bat-a',
    type: 'flexo',
    nom: 'Presse',
    numero: id.toUpperCase(),
    position: [5, 5],
    rotationDeg: 0,
    modele: { url: '/kit/modeles/flexo.glb' },
    ...patch,
  });
  const connexion = (machineId: string): Connexion => ({ id: `cx-${machineId}`, machineId, protocole: 'opcua', parametres: {}, etat: 'connectee', associations: {}, lectureSeule: true });

  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
    useProject.getState().startAssistant();
    useProject.getState().setSite(site('Usine'));
    useProject.getState().upsertBatiment(batiment('bat-a'));
    useProject.getState().upsertBatiment(batiment('bat-b'));
  });

  it('Ctrl+Z reprend les zones, les machines, les connexions et les réglages, un pas à la fois', () => {
    const p = useProject.getState();
    p.addZone(zone('z1'));
    p.addMachine(machine('r01', { zoneId: 'z1' }));
    p.setConnexion(connexion('r01'));
    p.setPerso('r01', { organes: [], points: [] });
    expect(useProject.getState().connexions.r01).toBeDefined();

    // La connexion et ses réglages, enregistrés ensemble, font un seul pas.
    p.undo();
    expect(useProject.getState().connexions.r01).toBeUndefined();
    expect(useProject.getState().perso.r01).toBeUndefined();
    p.undo();
    expect(useProject.getState().machines).toEqual([]);
    p.undo();
    expect(useProject.getState().zones).toEqual([]);

    p.redo();
    p.redo();
    expect(useProject.getState().machines.map((m) => m.id)).toEqual(['r01']);
  });

  it('un glisser ou une saisie suivis ne font qu’un pas d’annulation', () => {
    const p = useProject.getState();
    p.addMachine(machine('r01'));
    for (let x = 6; x <= 20; x++) p.updateMachine('r01', { position: [x, 5] });
    p.addZone(zone('z1'));
    for (const nom of ['I', 'Im', 'Imp']) p.updateZone('z1', { nom });
    p.undo();
    expect(useProject.getState().zones[0].nom).toBe('z1');
    p.undo();
    expect(useProject.getState().zones).toEqual([]);
    p.undo();
    expect(useProject.getState().machines[0].position).toEqual([5, 5]);
  });

  it('retirer une machine emporte sa connexion ; « Annuler » la remet à sa place, même après une autre modification', () => {
    const p = useProject.getState();
    p.addMachine(machine('r01'));
    p.addMachine(machine('r02'));
    p.setConnexion(connexion('r01'));
    const r = p.removeMachine('r01');
    expect(useProject.getState().connexions.r01).toBeUndefined();
    p.updateMachine('r02', { rotationDeg: 90 });

    useProject.getState().restaurer(r!);
    const s = useProject.getState();
    expect(s.machines.map((m) => m.id)).toEqual(['r01', 'r02']);
    expect(s.machines[1].rotationDeg).toBe(90);
    expect(s.connexions.r01?.id).toBe('cx-r01');

    // Déjà revenue : une seconde restauration ne double rien.
    useProject.getState().restaurer(r!);
    expect(useProject.getState().machines).toHaveLength(2);
  });

  it('l’avis « R01 retirée » propose Annuler, qui remet la machine', () => {
    vi.stubGlobal('window', { setTimeout: () => 0 });
    useLive.setState({ toasts: [] });
    useProject.getState().addMachine(machine('r01'));
    retirerMachine('r01');
    const avis = useLive.getState().toasts[0];
    expect(avis.titre).toBe('R01 retirée');
    expect(avis.action?.libelle).toBe('Annuler');
    avis.action?.faire();
    expect(useProject.getState().machines.map((m) => m.id)).toEqual(['r01']);
    vi.unstubAllGlobals();
  });

  it('retirer une zone laisse ses machines en place, sans zone, et l’annulation la leur rend', () => {
    const p = useProject.getState();
    p.addZone(zone('z1'));
    p.addMachine(machine('r01', { zoneId: 'z1' }));
    const r = p.removeZone('z1');
    expect(useProject.getState().machines[0].zoneId).toBeUndefined();
    useProject.getState().restaurer(r!);
    expect(useProject.getState().zones.map((z) => z.id)).toEqual(['z1']);
    expect(useProject.getState().machines[0].zoneId).toBe('z1');
  });

  it('retirer un bâtiment emporte ses zones et ses machines, rien ne reste orphelin', () => {
    const p = useProject.getState();
    p.addZone(zone('z-a'));
    p.addZone(zone('z-b', 'bat-b'));
    p.addMachine(machine('r01'));
    p.addMachine(machine('r02', { batimentId: 'bat-b', zoneId: 'z-b' }));
    p.setConnexion(connexion('r02'));
    expect(contenuBatiment(useProject.getState(), 'bat-b')).toMatchObject({ zones: [{ id: 'z-b' }], machines: [{ id: 'r02' }] });

    const r = p.removeBatiment('bat-b');
    let s = useProject.getState();
    expect(s.batiments.map((b) => b.id)).toEqual(['bat-a']);
    expect(s.zones.map((z) => z.id)).toEqual(['z-a']);
    expect(s.machines.map((m) => m.id)).toEqual(['r01']);
    expect(s.connexions.r02).toBeUndefined();

    useProject.getState().restaurer(r!);
    s = useProject.getState();
    expect(s.batiments.map((b) => b.id)).toEqual(['bat-a', 'bat-b']);
    expect(s.zones.map((z) => z.id)).toEqual(['z-a', 'z-b']);
    expect(s.machines.map((m) => m.id)).toEqual(['r01', 'r02']);
    expect(s.connexions.r02?.machineId).toBe('r02');
  });
});

describe('reprendre une organisation enregistrée', () => {
  beforeEach(() => {
    globalThis.localStorage = memoryStorage();
  });

  it('une organisation ouverte puis quittée sans rien saisir ne se propose pas à la reprise', () => {
    localStorage.setItem('evan.assistant.v2', JSON.stringify({ organisation: { id: 'org-moi', nom: '' }, activeId: 'u1', usines: [{ id: 'u1', site: null, batiments: [], zones: [], machines: [] }] }));
    expect(hasSavedAssistant()).toBe(false);
  });

  it('un nom d’organisation ou une usine localisée suffit', () => {
    localStorage.setItem('evan.assistant.v2', JSON.stringify({ organisation: { id: 'org-moi', nom: 'Ateliers du Nord' }, activeId: 'u1', usines: [] }));
    expect(hasSavedAssistant()).toBe(true);
    localStorage.setItem('evan.assistant.v2', JSON.stringify({ organisation: { id: 'org-moi', nom: '' }, activeId: 'u1', usines: [{ id: 'u1', site: site('Lille') }] }));
    expect(hasSavedAssistant()).toBe(true);
  });

  it('une sauvegarde illisible ne se propose pas', () => {
    localStorage.setItem('evan.assistant.v2', '{pas du json');
    expect(hasSavedAssistant()).toBe(false);
  });
});
