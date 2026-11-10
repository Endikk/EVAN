/**
 * La hauteur de chaque bâtiment, réglée au curseur en regardant la 3D. D'où vient la valeur proposée (IGN, défaut)
 * est dit en deux mots ; une hauteur réglée ou confirmée est vérifiée. Surface et volume suivent sous le curseur et
 * bougent avec lui ; le nombre de niveaux se règle juste en dessous, et la 3D trace un plancher par étage. Ce qu'est la hauteur sous toiture et comment la régler : dans le « ? » du titre.
 */
import { useMemo, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { Batiment } from '@/domain/types';
import { DEFAULT_HEIGHT } from '@/geo/footprint';
import { formatNumber } from '@/geo/geodesy';
import { useProject } from '@/store/project';
import { ChiffresSecondaires, TitreCarte } from '@/ui/explain';
import { measureBuilding } from '@/widgets/carte/measure';
import { NiveauxBatiment } from '@/widgets/usines/NiveauxBatiment';
import { useHauteursVerifiees } from '../lib/hauteurs';

/** Bornes du curseur : d'un local de plain-pied à un grand entrepôt à rayonnages. */
const HAUTEUR_MIN = 3;
const HAUTEUR_MAX = 25;
const PAS = 0.1;

/** D'où vient une hauteur pas encore vérifiée, en deux mots. */
function origine(b: Batiment): string {
  if (b.hauteur === DEFAULT_HEIGHT) return 'Valeur par défaut';
  if (b.source === 'bdtopo') return 'Mesurée par l’IGN';
  return 'Valeur de la source';
}

export function HauteursCard({ estVerifiee, style }: { estVerifiee: (id: string) => boolean; style?: CSSProperties }) {
  const batiments = useProject((s) => s.batiments);
  const marquer = useHauteursVerifiees((s) => s.marquer);
  const surfaces = useMemo(() => new Map(batiments.map((b) => [b.id, measureBuilding(b).area])), [batiments]);

  return (
    <section className="pln-hauteurs entree" style={style} data-guide="hauteurs" aria-labelledby="pln-hauteurs-titre">
      <TitreCarte
        id="pln-hauteurs-titre"
        titre="Hauteur et niveaux des bâtiments"
        terme="hauteurSousToiture"
        aide="L’IGN la donne pour la plupart des bâtiments ; sinon, EVAN met une valeur par défaut. Glissez le curseur jusqu’à ce que la 3D ressemble au bâtiment, ou confirmez la valeur. Un bâtiment à étages : ajoutez ses niveaux, chacun aura son plan."
      />
      <div className="stack pln-bats">
        {batiments.map((b) => {
          const ok = estVerifiee(b.id);
          const surface = surfaces.get(b.id) ?? 0;
          return (
            <div key={b.id} className="card pln-bat">
              <label className="pln-curseur">
                <span className="row between">
                  <b className="truncate">{b.nom}</b>
                  <b className="num pln-valeur">{formatNumber(b.hauteur, 1)} m</b>
                </span>
                <input
                  type="range"
                  min={HAUTEUR_MIN}
                  max={HAUTEUR_MAX}
                  step={PAS}
                  value={b.hauteur}
                  onChange={(e) => {
                    useProject.getState().setHauteur(b.id, Number(e.target.value));
                    marquer(b.id);
                  }}
                  aria-label={`Hauteur sous toiture de ${b.nom}, en mètres`}
                  aria-valuetext={`${formatNumber(b.hauteur, 1)} mètres`}
                />
              </label>
              <div className="row between pln-bat-pied">
                <ChiffresSecondaires
                  label={`Mesures de ${b.nom}`}
                  className="pln-mesures"
                  items={[
                    { label: 'Au sol', valeur: formatNumber(Math.round(surface)), unite: 'm²' },
                    { label: 'Volume', valeur: formatNumber(Math.round(surface * b.hauteur)), unite: 'm³' },
                  ]}
                />
                {ok ? (
                  <span className="chip pln-verifiee">
                    <Check /> Vérifiée
                  </span>
                ) : (
                  <span className="pln-a-verifier">
                    <span className="pln-origine">{origine(b)}</span>
                    <button type="button" className="btn sm" onClick={() => marquer(b.id)}>
                      <Check /> C’est juste
                    </button>
                  </span>
                )}
              </div>
              <div className="pln-niveaux">
                <NiveauxBatiment b={b} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
