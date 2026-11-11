/**
 * Administrateur : la passerelle de chaque usine. Le fichier de configuration (appsettings.json) se télécharge depuis
 * le serveur, construit à partir des connexions de l'étape 5 ; le certificat client et les droits MQTT restent une
 * étape d'exploitant, sur le poste qui garde la clé de l'autorité, avec la commande à copier sous chaque usine.
 * Une usine sans passerelle n'a ni fichier ni commande : la ligne dit pourquoi au lieu d'un bouton grisé muet.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { appel, ErreurApi } from '@/api/http';
import type { Organisation, Site } from '@/domain/types';
import { Copier } from './Copier';

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

/** La commande de l'exploitant, et de quoi la copier. */
function Commande({ site, passerelle }: { site: Site; passerelle: string }) {
  const texte = `infra/mosquitto/ajouter-passerelle.sh ${site.id} ${passerelle}`;
  const ref = useRef<HTMLElement>(null);
  return (
    <div className="cpt-commande-ligne">
      <code ref={ref} className="cpt-commande">
        {texte}
      </code>
      <Copier texte={texte} quoi={`la commande de la passerelle ${passerelle}`} source={ref} />
    </div>
  );
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
        Chaque usine a sa passerelle, installée sur le réseau de l’atelier. « Télécharger la configuration » enregistre son fichier appsettings.json, à
        déposer à côté d’elle : il reprend les machines branchées à l’étape 5 et ne contient aucun mot de passe. L’exploitant du serveur crée ensuite son
        certificat avec la commande donnée sous l’usine.
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
      {sites?.length === 0 && <p className="cpt-note">Aucune usine enregistrée pour l’instant : configurez-en une depuis « Ouvrir mes usines ».</p>}
      {sites && sites.length > 0 && (
        <ul className="cpt-passerelles">
          {sites.map((s) => (
            <li key={s.id}>
              <div>
                <b>{s.nom}</b>
                {s.passerelle && <span className="mono">Passerelle {s.passerelle}</span>}
              </div>
              {s.passerelle ? (
                <>
                  <button
                    className="btn sm"
                    onClick={() => void obtenir(s)}
                    disabled={enCours === s.id}
                    aria-busy={enCours === s.id || undefined}
                    aria-label={`Télécharger la configuration de la passerelle ${s.passerelle}`}
                  >
                    <Download aria-hidden /> {enCours === s.id ? 'Préparation…' : 'Télécharger la configuration'}
                  </button>
                  <Commande site={s} passerelle={s.passerelle} />
                </>
              ) : (
                <p className="cpt-note cpt-sans-passerelle">
                  Pas encore de passerelle : le serveur en attribue une quand l’usine est enregistrée depuis « Ouvrir mes usines ». Le fichier et la
                  commande apparaîtront alors ici.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
