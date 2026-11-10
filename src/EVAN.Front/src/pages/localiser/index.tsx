/** Étape 1 · Localiser : chercher l'usine sur la carte satellite, puis relever l'emprise de ses bâtiments. */
import { useState } from 'react';
import { useProject } from '@/store/project';
import { Zone } from '@/widgets/shell/zones';
import { AccueilCarte } from './features/AccueilCarte';
import { CommandesCarte } from './features/CommandesCarte';
import { SearchBox } from './features/SearchBox';
import { SitePanel } from './features/SitePanel';
import './index.css';

export function LocaliserPage() {
  const mode = useProject((s) => s.mode);
  const site = useProject((s) => s.site);
  const organisationNommee = useProject((s) => !!s.organisation.nom);
  // Pendant la saisie, la liste des résultats passe devant le conseil posé sur la carte.
  const [saisie, setSaisie] = useState(false);
  return (
    <>
      <Zone nom="carte">
        <div className="hud tl loc-hud-recherche">
          <SearchBox autoFocus={mode === 'assistant' && !site && organisationNommee} onSaisie={setSaisie} />
        </div>
        <AccueilCarte saisie={saisie} />
        <CommandesCarte />
      </Zone>
      <Zone nom="panneau">
        <SitePanel />
      </Zone>
    </>
  );
}
