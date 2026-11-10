/**
 * Les usines de l'organisation, en liste dans la barre latérale : la vue d'ensemble, puis chaque usine avec son état.
 * Un clic ouvre l'usine ; celle qui est ouverte est marquée. Barre repliée : le sélecteur compact (UsineMenu) prend
 * le relais.
 */
import { useMemo } from 'react';
import { LayoutGrid, Pencil, Plus } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { TonGlyph, type Ton } from '@/ui/explain';
import { openOrganisation } from '@/widgets/shell/navigation';
import { stopTour } from '@/widgets/tour/tour';
import { addUsine, resumeUsines } from './usines';
import { choisirUsine, useEtatOuverte } from './UsineMenu';

export function UsinesListe({ apres }: { apres?: () => void }) {
  const mode = useProject((s) => s.mode);
  const organisation = useProject((s) => s.organisation.nom);
  const activeId = useProject((s) => s.activeId);
  const usinesStore = useProject((s) => s.usines);
  const site = useProject((s) => s.site);
  const batiments = useProject((s) => s.batiments);
  const machines = useProject((s) => s.machines);
  const configure = useProject((s) => s.configure);
  const usines = useMemo(() => resumeUsines(useProject.getState()), [usinesStore, activeId, site, batiments, machines, configure]);
  const vueOrganisation = useUi((s) => s.vueOrganisation);
  const etat = useEtatOuverte();
  const assistant = mode === 'assistant';
  // Le nom de l'organisation d'un compte vient du serveur : il ne se renomme pas depuis ce navigateur.
  const serveur = useProject((s) => s.serveur);
  const renommable = assistant && !serveur;
  const enExploitation = usines.some((u) => u.configure);

  return (
    <section className="side-section side-usines" aria-labelledby="side-usines-titre">
      <div className="side-section-tete">
        <h2 id="side-usines-titre" className="truncate" title={organisation || undefined}>
          {organisation || 'Mon organisation'}
        </h2>
        {renommable && (
          <button
            className="btn sm icon ghost"
            title="Renommer l’organisation"
            aria-label="Renommer l’organisation"
            onClick={() => (apres?.(), useUi.getState().setOrganisationEdit(true))}
          >
            <Pencil />
          </button>
        )}
      </div>
      <ul className="side-liste">
        {enExploitation && (
          <li>
            <button
              className="side-item"
              aria-current={vueOrganisation ? 'page' : undefined}
              onClick={() => {
                apres?.();
                stopTour();
                openOrganisation();
              }}
              title={usines.length > 1 ? 'Toutes vos usines côte à côte : ce qui tourne, ce qui demande de l’attention' : 'Votre usine en un coup d’œil'}
            >
              <span className="side-icone" aria-hidden>
                <LayoutGrid />
              </span>
              <span className="side-txt">
                <b>Vue d’ensemble</b>
                <small>{usines.length > 1 ? `Les ${usines.length} usines` : 'L’usine en un coup d’œil'}</small>
              </span>
            </button>
          </li>
        )}
        {usines.map((u) => {
          const ouverte = u.id === activeId;
          const ici = ouverte && !vueOrganisation;
          const direct = ouverte && u.configure ? etat : undefined;
          const ton: Ton = direct?.ton ?? 'neutre';
          const situation = !u.configure ? 'Configuration à terminer' : direct ? direct.mot : `${u.machines} ${u.machines > 1 ? 'machines' : 'machine'}`;
          return (
            <li key={u.id}>
              <button
                className={`side-item side-usine ${ouverte ? 'ouverte' : ''}`}
                aria-current={ici ? 'page' : undefined}
                onClick={() => {
                  apres?.();
                  choisirUsine(u.id);
                }}
                title={[u.nom, u.adresse].filter(Boolean).join(', ')}
              >
                <span className={`side-icone side-etat ton-${ton}`} aria-hidden>
                  <TonGlyph ton={ton} />
                </span>
                <span className="side-txt">
                  <b className="truncate">{u.nom}</b>
                  <small className={`truncate ton-${ton}`}>{situation}</small>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {assistant && (
        <button
          className="side-item side-ajout"
          onClick={() => {
            apres?.();
            stopTour();
            void addUsine();
          }}
        >
          <span className="side-icone" aria-hidden>
            <Plus />
          </span>
          <span className="side-txt">
            <b>Ajouter une usine</b>
          </span>
        </button>
      )}
    </section>
  );
}
