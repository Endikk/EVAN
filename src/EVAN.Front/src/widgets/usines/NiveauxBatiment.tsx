/**
 * Le nombre de niveaux d'un bâtiment, réglé au clic, avec ce que ça veut dire en clair (« Rez-de-chaussée et
 * 1 étage »). Le même réglage à l'étape 1, sous la surface, et à l'étape 2, à côté de la hauteur. On ne retire pas un
 * niveau qui porte encore une zone ou une machine.
 */
import type { Batiment } from '@/domain/types';
import { borneNiveaux, composition, niveauOccupeMax, nomNiveau, NIVEAUX_MAX } from '@/domain/niveaux';
import { useProject } from '@/store/project';
import { Compteur } from '@/ui/Compteur';
import './niveaux.css';

export function NiveauxBatiment({ b }: { b: Batiment }) {
  const occupe = useProject((s) => niveauOccupeMax(b.id, s.zones, s.machines));
  const niveaux = borneNiveaux(b.niveaux);
  return (
    <div className="niveaux-bat">
      <span className="niveaux-bat-texte">
        <b>Niveaux</b>
        <small>{composition(niveaux)}</small>
      </span>
      <Compteur
        valeur={niveaux}
        min={occupe + 1}
        max={NIVEAUX_MAX}
        onChange={(n) => useProject.getState().setNiveaux(b.id, n)}
        label={`Nombre de niveaux de ${b.nom}`}
        moins="Retirer un niveau"
        plus="Ajouter un étage"
        raisonMin={occupe > 0 ? `${nomNiveau(occupe)} porte encore une zone ou une machine : déplacez-les d’abord.` : undefined}
      />
    </div>
  );
}
