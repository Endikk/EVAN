/**
 * Vérifier le contour : le trait orange doit suivre le bord du toit. On le valide d'un clic, ou on le corrige
 * (déplacer les coins, redresser les angles, retirer les points en trop). Toute correction vaut vérification.
 * La consigne tient en une question tant que le contour n'est pas vérifié ; le reste est dans le « ? ».
 */
import type { CSSProperties } from 'react';
import { Check, Crosshair, Eraser, Redo2, SquareDashed, Undo2, ZoomIn } from 'lucide-react';
import type { Batiment } from '@/domain/types';
import { computeFrame, formatNumber, fromLocal, orthogonalize, simplifyIndices, toLocal } from '@/geo/geodesy';
import { useProject } from '@/store/project';
import { TitreCarte } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { RACCOURCI_ANNULER, RACCOURCI_RETABLIR } from '@/ui/touches';
import { handSigma } from '@/widgets/carte/measure';
import { useMapUi } from '@/widgets/carte/mapState';
import { useContoursVerifies } from '../lib/verifications';
import { GesteCoin } from './gestes';

/** Zoom à partir duquel la carte montre les coins du contour (voir SiteMap). */
const ZOOM_COINS = 16;
/** Écart (m) sous lequel un point est jugé aligné avec ses voisins, pour redresser puis pour simplifier. */
const TOLERANCE_EQUERRE_M = 0.3;
const TOLERANCE_SIMPLIFIER_M = 0.35;
/** Angle (degrés) sous lequel un côté presque droit est redressé. */
const ANGLE_EQUERRE_DEG = 12;
/** Un contour équerré ajoute une contrainte géométrique : l'incertitude par coin baisse un peu. */
const GAIN_EQUERRE = 0.85;

function equerrer(b: Batiment) {
  useProject.getState().pushHistory();
  const frame = computeFrame(b.contour);
  const local = b.contour.map((p) => toLocal(frame, p));
  const idx = simplifyIndices(local, TOLERANCE_EQUERRE_M);
  const simp = idx.map((i) => local[i]);
  const { points, source } = orthogonalize(simp, ANGLE_EQUERRE_DEG);
  const sig = idx.map((i) => b.sigmas[i] ?? b.sigmas[0]);
  useProject.getState().setContour(
    b.id,
    points.map((p) => fromLocal(frame, p)),
    source.map((i) => (sig[i] ?? 1) * GAIN_EQUERRE),
  );
}

function simplifier(b: Batiment) {
  useProject.getState().pushHistory();
  const frame = computeFrame(b.contour);
  const idx = simplifyIndices(
    b.contour.map((p) => toLocal(frame, p)),
    TOLERANCE_SIMPLIFIER_M,
  );
  useProject.getState().setContour(
    b.id,
    idx.map((i) => b.contour[i]),
    idx.map((i) => b.sigmas[i]),
  );
}

export function ContourCard({ b, verifie, style }: { b: Batiment; verifie: boolean; style?: CSSProperties }) {
  const passe = useProject((s) => s.past.length);
  const futur = useProject((s) => s.future.length);
  const edition = useMapUi((s) => s.mode === 'edit');
  const marquer = useContoursVerifies((s) => s.marquer);

  return (
    <section className="loc-contour entree" style={style} data-guide="contour" aria-labelledby="loc-contour-titre">
      <TitreCarte
        id="loc-contour-titre"
        titre="Vérifier le contour"
        terme="contour"
        aide={`Le trait orange doit suivre le bord du toit sur la photo ; s’il déborde ou coupe un bout du bâtiment, corrigez-le. Ce contour compte ${b.contour.length} coins.`}
        lecon={verifie ? undefined : 'Le trait orange suit-il le bord du toit ?'}
      />
      <div className="row wrap">
        {verifie ? (
          <span className="chip loc-verifie" role="status">
            <Check /> Contour vérifié
          </span>
        ) : (
          <button type="button" className="btn sm primary" onClick={() => marquer(b.id)}>
            <Check /> Le contour est juste
          </button>
        )}
        <button
          type="button"
          className={`btn sm ${edition ? 'active' : ''}`}
          aria-pressed={edition}
          onClick={() => {
            useMapUi.getState().setMode(edition ? 'browse' : 'edit');
            marquer(b.id);
          }}
        >
          <Crosshair /> Déplacer les coins
        </button>
      </div>
      {edition && <AideEdition />}
      <div className="row wrap loc-outils">
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            equerrer(b);
            marquer(b.id);
          }}
          title="Redresse à angle droit les côtés presque droits"
        >
          <SquareDashed /> Redresser les angles
        </button>
        <button
          type="button"
          className="btn sm ghost"
          onClick={() => {
            simplifier(b);
            marquer(b.id);
          }}
          title="Retire les points alignés ou en double"
        >
          <Eraser /> Retirer les points en trop
        </button>
        <button type="button" className="btn sm icon ghost" onClick={() => useProject.getState().undo()} disabled={!passe} title={`Annuler (${RACCOURCI_ANNULER})`} aria-label="Annuler la dernière correction">
          <Undo2 />
        </button>
        <button type="button" className="btn sm icon ghost" onClick={() => useProject.getState().redo()} disabled={!futur} title={`Rétablir (${RACCOURCI_RETABLIR})`} aria-label="Rétablir la correction annulée">
          <Redo2 />
        </button>
      </div>
    </section>
  );
}

/** Le geste, pendant l'édition. Abonné au zoom seulement ici : le reste du panneau ne bouge pas quand la carte bouge. */
function AideEdition() {
  const coinsVisibles = useMapUi((s) => s.zoom >= ZOOM_COINS);
  const mpp = useMapUi((s) => s.mpp);
  if (!coinsVisibles) {
    return (
      <p className="loc-aide row loc-geste-texte">
        <ZoomIn aria-hidden /> Zoomez sur le bâtiment pour voir ses coins.
      </p>
    );
  }
  return (
    <div className="loc-geste-edition">
      <GesteCoin className="petit" />
      <p className="loc-aide">
        Glissez chaque coin sur l’angle du toit.
        <InfoTip label="Ajouter, enlever un coin, et sa précision">
          <p>Glissez le point au milieu d’un côté pour ajouter un coin ; double-cliquez un coin pour l’enlever. Les côtés s’alignent d’eux-mêmes sur le bâtiment.</p>
          <p>
            Au zoom actuel, un coin replacé à la main est précis à ± {formatNumber(handSigma(mpp), 2)} m. Plus on zoome, plus il est précis.
          </p>
        </InfoTip>
      </p>
    </div>
  );
}
