/**
 * Les bâtiments de l'usine : un clic en sélectionne un (son contour passe au premier plan sur la carte), la corbeille
 * le retire. Chaque ligne dit sa surface, avec une barre qui la compare au plus grand. En bas, la surface totale,
 * comparée à celle que l'entreprise annonce quand on la connaît.
 */
import { useMemo, type CSSProperties } from 'react';
import { Box, Trash2 } from 'lucide-react';
import { formatArea, formatNumber } from '@/geo/geodesy';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { ChiffresSecondaires, TitreCarte, TonGlyph, type ChiffreSecondaire } from '@/ui/explain';
import { measureBuilding } from '@/widgets/carte/measure';
import { verdictAnnonce } from '../lib/verdicts';

export function BatimentsCard({ selectedId, style }: { selectedId?: string; style?: CSSProperties }) {
  const batiments = useProject((s) => s.batiments);
  const annonce = useProject((s) => s.site?.surfaceAnnoncee);
  // Une mesure géodésique par bâtiment, recalculée seulement quand la liste change (pas à chaque mouvement de carte).
  const surfaces = useMemo(() => new Map(batiments.map((x) => [x.id, measureBuilding(x).area])), [batiments]);
  const total = useMemo(() => [...surfaces.values()].reduce((s, a) => s + a, 0), [surfaces]);
  const plusGrande = useMemo(() => Math.max(1, ...surfaces.values()), [surfaces]);
  const verdict = verdictAnnonce(total, annonce);
  // Le total et la surface annoncée côte à côte ; l'écart dans le « ? » quand il est normal, en clair quand il ne l'est pas.
  const chiffres: ChiffreSecondaire[] = [
    ...(batiments.length > 1 || annonce ? [{ label: 'Total au sol', valeur: formatNumber(Math.round(total)), unite: 'm²' }] : []),
    ...(annonce && verdict
      ? [
          {
            label: 'Annoncée',
            valeur: formatNumber(Math.round(annonce)),
            unite: 'm²',
            aide: verdict.ton === 'ok' ? `Surface déclarée par l’entreprise. ${verdict.texte}` : 'Surface déclarée par l’entreprise.',
            ton: verdict.ton,
          },
        ]
      : []),
  ];

  return (
    <section className="loc-batiments entree" style={style} data-guide="batiments" aria-labelledby="loc-batiments-titre">
      <TitreCarte
        id="loc-batiments-titre"
        titre="Bâtiments de l’usine"
        aide="Un autre bâtiment fait partie de l’usine ? Cliquez sur son toit : il s’ajoute ici. Chaque ligne donne sa surface au sol et sa hauteur."
      />
      <ul className="list loc-bat-liste">
        {batiments.map((x) => {
          const surface = surfaces.get(x.id) ?? 0;
          return (
            <li key={x.id} className="loc-bat">
              <button type="button" className="item" aria-pressed={x.id === selectedId} onClick={() => useUi.getState().selectBatiment(x.id)}>
                <Box size={16} aria-hidden />
                <span className="grow loc-bat-texte">
                  <span className="t truncate">{x.nom}</span>
                  <span className="loc-bat-barre" aria-hidden>
                    <i style={{ transform: `scaleX(${surface / plusGrande})` }} />
                  </span>
                </span>
                <span className="loc-bat-valeurs num">
                  <b>{formatArea(surface)}</b>
                  <small>{formatNumber(x.hauteur, 1)} m de haut</small>
                </span>
              </button>
              <button type="button" className="btn sm icon ghost loc-bat-suppr" aria-label={`Retirer ${x.nom} de l’usine`} title="Retirer de l’usine" onClick={() => useProject.getState().removeBatiment(x.id)}>
                <Trash2 />
              </button>
            </li>
          );
        })}
      </ul>
      {chiffres.length > 0 && <ChiffresSecondaires items={chiffres} label="Surface de l’usine" className="loc-totaux" />}
      {verdict?.ton === 'warn' && (
        <p className="loc-annonce ton-warn">
          <TonGlyph ton="warn" />
          <span>{verdict.texte}</span>
        </p>
      )}
    </section>
  );
}
