/**
 * Administrateur : la passerelle de chaque usine. Le fichier de configuration (appsettings.json) se télécharge depuis
 * le serveur, construit à partir des connexions de l'étape 5 ; le certificat client et les droits MQTT restent une
 * étape d'exploitant, sur le poste qui garde la clé de l'autorité.
 */
import { useEffect, useId, useState } from 'react';
import { Download } from 'lucide-react';
import { appel, ErreurApi } from '@/api/http';
import type { Organisation, Site } from '@/domain/types';

/** Le fichier tel que le serveur le renvoie : on ne fait que le déposer, sans le relire. */
async function telecharger(site: Site) {
  const res = await fetch(`/api/sites/${encodeURIComponent(site.id)}/passerelle/config`, { credentials: 'same-origin', signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new ErreurApi(res.status, res.status === 403 ? 'Réservé aux administrateurs.' : `Le serveur a refusé (erreur ${res.status}).`);
  const url = URL.createObjectURL(await res.blob());
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = `appsettings.${site.passerelle ?? site.id}.json`;
  lien.click();
  URL.revokeObjectURL(url);
}

export function Passerelles() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [erreur, setErreur] = useState<string>();
  const [enCours, setEnCours] = useState<string>();
  const titre = useId();

  useEffect(() => {
    appel<{ organisation: Organisation; sites: Site[] }>('GET', '/api/organisation').then(
      (r) => setSites(r.sites),
      (err: unknown) => setErreur(err instanceof ErreurApi ? err.message : 'Usines indisponibles.'),
    );
  }, []);

  const obtenir = async (site: Site) => {
    setEnCours(site.id);
    setErreur(undefined);
    try {
      await telecharger(site);
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : 'Téléchargement interrompu.');
    } finally {
      setEnCours(undefined);
    }
  };

  return (
    <section className="cpt-carte" aria-labelledby={titre}>
      <h2 id={titre}>Passerelles des usines</h2>
      <p className="cpt-intro">
        Chaque usine a sa passerelle, installée sur le réseau de l’atelier. Son fichier de configuration reprend les machines branchées à l’étape 5 ; il ne
        contient aucun mot de passe. L’exploitant du serveur crée ensuite son certificat avec la commande indiquée.
      </p>
      {erreur && (
        <p className="cpt-erreur" role="alert">
          {erreur}
        </p>
      )}
      {!sites && !erreur && (
        <p className="cpt-note" role="status">
          Chargement des usines…
        </p>
      )}
      {sites?.length === 0 && <p className="cpt-note">Aucune usine enregistrée pour l’instant : configurez-en une depuis « Ouvrir mes usines ».</p>}
      {sites && sites.length > 0 && (
        <ul className="cpt-passerelles">
          {sites.map((s) => (
            <li key={s.id}>
              <div>
                <b>{s.nom}</b>
                <span className="mono">Passerelle {s.passerelle ?? 'non attribuée'}</span>
              </div>
              <button className="btn sm" onClick={() => void obtenir(s)} disabled={!s.passerelle || enCours === s.id} aria-busy={enCours === s.id || undefined}>
                <Download aria-hidden /> {enCours === s.id ? 'Préparation…' : 'Configuration'}
              </button>
              {s.passerelle && <code className="cpt-commande">infra/mosquitto/ajouter-passerelle.sh {s.id} {s.passerelle}</code>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
