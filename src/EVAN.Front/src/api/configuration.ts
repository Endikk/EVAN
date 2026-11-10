/**
 * Configuration d'une usine telle que le serveur la garde (PUT et GET /api/sites/{id}) : les objets du front tels
 * quels, organes et points de chaque machine compris (catalogue et saisies confondus), connexions en liste.
 * Le passage dans les deux sens est sans perte : une usine relue est celle qui a été enregistrée.
 */
import { machineModel } from '@/domain/catalog';
import type { Batiment, Connexion, Machine, Organe, PointDeMesure, Site, Zone } from '@/domain/types';
import { emptyUsine, type Perso, type Usine } from '@/store/project';

export interface ConfigurationUsine {
  site: Site;
  batiments: Batiment[];
  zones: Zone[];
  machines: Machine[];
  organes: Organe[];
  points: PointDeMesure[];
  connexions: Connexion[];
  configure: boolean;
}

/** Un modèle importé (adresse blob:) ne vit que dans ce navigateur : sa machine n'est pas envoyée au serveur. */
export const estImportee = (m: Machine) => m.modele.url.startsWith('blob:');

/** Ce que l'on envoie au serveur pour une usine dont l'adresse est trouvée ; null tant qu'elle n'a pas de site. */
export function versConfiguration(u: Usine): ConfigurationUsine | null {
  if (!u.site) return null;
  const machines = u.machines.filter((m) => !estImportee(m));
  const gardees = new Set(machines.map((m) => m.id));
  const modeles = machines.map((m) => machineModel(m, u.perso[m.id]));
  return {
    site: u.site,
    batiments: u.batiments,
    zones: u.zones,
    machines,
    organes: modeles.flatMap((m) => m.organes),
    points: modeles.flatMap((m) => m.points),
    connexions: Object.values(u.connexions).filter((c) => gardees.has(c.machineId)),
    configure: u.configure,
  };
}

/** Objet sans les clés indéfinies, clés triées : deux formes du même objet donnent le même texte. */
function canonique(v: unknown): string {
  return JSON.stringify(v, (_, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
}

/**
 * Une usine relue du serveur, sous la forme du store. Les organes et points d'une machine ne deviennent des saisies
 * (perso) que s'ils diffèrent de ceux du catalogue : une machine du kit laissée telle quelle le reste.
 */
export function depuisConfiguration(c: ConfigurationUsine): Usine {
  const perso: Record<string, Perso> = {};
  for (const m of c.machines) {
    const organes = c.organes.filter((o) => o.machineId === m.id);
    const points = c.points.filter((p) => p.machineId === m.id);
    const catalogue = machineModel(m);
    if (canonique(organes) !== canonique(catalogue.organes) || canonique(points) !== canonique(catalogue.points)) perso[m.id] = { organes, points };
  }
  return {
    ...emptyUsine(c.site.id),
    site: c.site,
    batiments: c.batiments,
    zones: c.zones,
    machines: c.machines,
    connexions: Object.fromEntries(c.connexions.map((x) => [x.machineId, x])),
    perso,
    configure: c.configure,
  };
}
