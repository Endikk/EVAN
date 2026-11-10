/**
 * L'organisation d'un compte connecté, côté serveur : relecture de ses usines au chargement de /assistant, et
 * enregistrement de la configuration d'une usine (PUT /api/sites/{id}).
 */
import type { Organisation, Site } from '@/domain/types';
import type { Usine } from '@/store/project';
import { appel } from './http';
import { depuisConfiguration, type ConfigurationUsine } from './configuration';

/** Une configuration complète peut peser plusieurs centaines de kilo-octets : délai plus long que les autres appels. */
const DELAI_ENREGISTREMENT_MS = 30_000;

/** L'organisation du compte et toutes ses usines, sous la forme du store. Lève ErreurApi si le serveur refuse. */
export async function lireOrganisation(): Promise<{ organisation: Organisation; usines: Usine[] }> {
  const { organisation, sites } = await appel<{ organisation: Organisation; sites: Site[] }>('GET', '/api/organisation');
  const configurations = await Promise.all(sites.map((s) => appel<ConfigurationUsine>('GET', `/api/sites/${encodeURIComponent(s.id)}`)));
  return { organisation, usines: configurations.map(depuisConfiguration) };
}

/** Enregistre la configuration complète d'une usine. Lève ErreurApi avec les champs refusés. */
export function enregistrerUsine(configuration: ConfigurationUsine): Promise<ConfigurationUsine> {
  return appel<ConfigurationUsine>('PUT', `/api/sites/${encodeURIComponent(configuration.site.id)}`, configuration, DELAI_ENREGISTREMENT_MS);
}
