/**
 * Les variables qu'un automate met à disposition, et leur rapprochement avec les points de mesure de la machine.
 * Chaque variable porte une phrase qui dit ce qu'elle contient (« DeviceStatus : l'état de la machine »).
 */
import { slug } from '@/domain/catalog';
import type { Machine, PointDeMesure, Protocole } from '@/domain/types';

export interface Variable {
  id: string;
  nom: string;
  type: string;
  /** Ce que contient la variable, en clair. */
  sens: string;
}

export type Association = Record<string, { pointId: string; score: number }>;

const SENS_CONNUS: Record<string, string> = {
  DeviceStatus: 'L’état de la presse : en marche, à l’arrêt, en panne.',
  Speed: 'La vitesse de la presse.',
  ProductionCounter: 'Le compteur de production : la bande imprimée.',
  WasteCounter: 'Le compteur de gâche : la bande jetée.',
  'Notification (alarmes)': 'Les alarmes que la presse signale.',
  'Diagnostics.CycleTime': 'Le temps de cycle de l’automate, pour le diagnostic.',
  'Server.ServerStatus.CurrentTime': 'L’heure de l’automate, qui sert à dater les valeurs.',
};

export function sensVariable(nom: string): string {
  return SENS_CONNUS[nom] ?? 'Une valeur publiée par l’automate.';
}

/** Libellé d'une mesure en minuscule dans une phrase, sauf sigle (« pH », « UV »). */
function enPhrase(libelle: string): string {
  return /^[A-ZÉÈÀ][a-zéèêàâîôûç]/.test(libelle) ? libelle.charAt(0).toLowerCase() + libelle.slice(1) : libelle;
}

/**
 * Nom d'organe écrit comme un mnémonique d'automate, un mot par majuscule : « Dérouleur et guide-bande » donne
 * « DerouleurEtGuideBande ». Collés en minuscules, les mots devenaient illisibles (« Derouleuretguidebande »). Les
 * élisions d'une lettre (« d' », « l' ») tombent ; un sigle (« RFID ») reste en capitales.
 */
export function motsEnMajuscules(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter((mot) => mot.length > 1 || /\d/.test(mot))
    .map((mot) => (mot === mot.toUpperCase() ? mot : mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase()))
    .join('');
}

/** Variables « découvertes » pour une machine (parcours de l'espace d'adressage simulé). */
export function browseVariables(machine: Machine, protocole: Protocole, points: PointDeMesure[], organes: { id: string; nom: string }[]): Variable[] {
  const orgName = (id: string) => organes.find((o) => o.id === id)?.nom ?? '';
  if (protocole === 'jmf') {
    return (
      [
        ['JMF/Status/DeviceStatus', 'DeviceStatus', 'enum'],
        ['JMF/Status/Speed', 'Speed', 'Double'],
        ['JMF/Status/ProductionCounter', 'ProductionCounter', 'Int64'],
        ['JMF/Status/WasteCounter', 'WasteCounter', 'Int64'],
        ['JMF/Notification/Event', 'Notification (alarmes)', 'Event'],
      ] as const
    ).map(([id, nom, type]) => ({ id, nom, type, sens: sensVariable(nom) }));
  }
  const vars: Variable[] = points.map((p, i) => {
    const organ = motsEnMajuscules(orgName(p.organeId));
    const leaf = p.cle.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
    const name = `${organ}.${leaf.charAt(0).toUpperCase()}${leaf.slice(1)}`;
    const id =
      protocole === 'opcua'
        ? `ns=2;s=${machine.numero}.${name}`
        : protocole === 'modbus'
          ? `HR ${40101 + i * 2} (float32)`
          : protocole === 's7'
            ? `DB10.DBD${i * 4}`
            : protocole === 'mqtt'
              ? `capteurs/${machine.numero}/${slug(orgName(p.organeId))}/${p.cle}`
              : `sim/${machine.numero}/${p.organeId.split('.').pop()}/${p.cle}`;
    const organe = orgName(p.organeId);
    return {
      id,
      nom: name,
      type: p.type === 'alarme' ? 'Boolean' : p.type === 'comptage' ? 'Int32' : 'Double',
      sens: organe ? `${p.libelle}, sur l’organe « ${enPhrase(organe)} ».` : `${p.libelle}.`,
    };
  });
  if (protocole === 'opcua') {
    vars.push({ id: `ns=2;s=${machine.numero}.Diagnostics.CycleTime`, nom: 'Diagnostics.CycleTime', type: 'Double', sens: sensVariable('Diagnostics.CycleTime') });
    vars.push({ id: 'ns=0;i=2258', nom: 'Server.ServerStatus.CurrentTime', type: 'DateTime', sens: sensVariable('Server.ServerStatus.CurrentTime') });
  }
  return vars;
}

function tokens(s: string) {
  return slug(s.replace(/([a-z])([A-Z])/g, '$1_$2'))
    .split('_')
    .filter((t) => t.length > 1);
}

/** Association automatique variable → point : recouvrement des mots (organe + mesure). */
export function autoMatch(vars: Variable[], points: PointDeMesure[], organes: { id: string; nom: string }[]): Association {
  const out: Association = {};
  for (const v of vars) {
    // Les mots de la variable, plus son organe d'un seul tenant (« derouleuretguidebande ») : c'est lui qui départage deux
    // organes qui partagent des mots (dérouleur, guide-bande).
    const organeVar = v.nom.includes('.') ? slug(v.nom.split('.')[0]).replace(/_/g, '') : '';
    const vt = new Set([...tokens(v.nom), ...(organeVar ? [organeVar] : [])]);
    let best: { pointId: string; score: number } | null = null;
    for (const p of points) {
      const pt = new Set([...tokens(p.cle), ...tokens(organes.find((o) => o.id === p.organeId)?.nom ?? '').map((t) => t.replace(/_/g, ''))]);
      const orgJoined = slug(organes.find((o) => o.id === p.organeId)?.nom ?? '').replace(/_/g, '');
      if (vt.has(orgJoined)) pt.add(orgJoined);
      let inter = 0;
      for (const t of vt) if (pt.has(t)) inter++;
      const score = inter / Math.max(vt.size, 1);
      if (score > 0.5 && (!best || score > best.score)) best = { pointId: p.id, score };
    }
    if (best) out[v.id] = best;
  }
  // Variables JMF : vitesse et alarmes de la presse.
  for (const v of vars) {
    if (v.nom === 'Speed') {
      const p = points.find((x) => x.cle === 'vitesse');
      if (p) out[v.id] = { pointId: p.id, score: 0.9 };
    }
    if (v.nom.startsWith('Notification')) {
      const p = points.find((x) => x.cle === 'alarmes');
      if (p) out[v.id] = { pointId: p.id, score: 0.8 };
    }
  }
  return out;
}

/** Nombre de variables reliées parmi celles de la liste (une association restée d'un autre protocole ne compte pas). */
export function nbReliees(vars: Variable[], assoc: Association): number {
  return vars.filter((v) => assoc[v.id]).length;
}

/**
 * Associations de départ d'une machine déjà branchée : celles qui sont enregistrées, si elles portent sur les variables
 * lues ; sinon (aucune, ou des noms d'un ancien format), la proposition automatique.
 */
export function associationsDeDepart(vars: Variable[], saved: Record<string, string>, auto: () => Association): Association {
  const reprises: Association = Object.fromEntries(Object.entries(saved).map(([k, p]) => [k, { pointId: p, score: 1 }]));
  return nbReliees(vars, reprises) > 0 ? reprises : auto();
}
