/**
 * Panneau de l'étape 1 : ce qu'il reste à faire (liste qui se coche seule, comment faire depuis chaque libellé), ce qu'EVAN
 * est en train de faire, puis la surface au sol du bâtiment choisi, la vérification de son contour et les bâtiments
 * de l'usine. Tant que le contour n'est pas vérifié, sa carte passe avant la surface : c'est la tâche qui reste, elle
 * doit se voir sans défiler.
 */
import { useMemo } from 'react';
import { AlertTriangle, Loader2, PenLine } from 'lucide-react';
import { useTachesConfig } from '@/store/avancement';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { GuideButton, StepGuide, TitreCarte, type Tache } from '@/ui/explain';
import { measureBuilding } from '@/widgets/carte/measure';
import { useMapUi } from '@/widgets/carte/mapState';
import { PanelHeader } from '@/widgets/shell/PanelHeader';
import { useContoursVerifies } from '../lib/verifications';
import { BatimentsCard } from './BatimentsCard';
import { CandidatesCard } from './CandidatesCard';
import { ContourCard } from './ContourCard';
import { GUIDE_LOCALISER } from './guide';
import { SurfaceCard } from './SurfaceCard';

const cascade = (i: number) => ({ ['--i' as string]: i });

export function SitePanel() {
  const mode = useProject((s) => s.mode);
  const site = useProject((s) => s.site);
  const batiments = useProject((s) => s.batiments);
  const selectedId = useUi((s) => s.selectedBatimentId) ?? batiments[0]?.id;
  const detecting = useMapUi((s) => s.detecting);
  const locating = useMapUi((s) => s.locating);
  const localisation = useMapUi((s) => s.localisation);
  const detectError = useMapUi((s) => s.detectError);
  const dessin = useMapUi((s) => s.mode === 'draw');
  const editing = useMapUi((s) => s.editing);
  const lastAddedId = useMapUi((s) => s.lastAddedId);
  const verifies = useContoursVerifies((s) => s.ids);

  const b = batiments.find((x) => x.id === selectedId);
  const live = editing && editing.id === b?.id ? editing : null;
  const m = useMemo(() => (b ? measureBuilding({ ...b, contour: live?.ring ?? b.contour, sigmas: live?.sigmas ?? b.sigmas }) : null), [b, live]);

  // L'usine d'exemple est déjà relevée et vérifiée ; ailleurs, chaque contour doit avoir été regardé. La coche de la
  // tâche vient du calcul commun (store/avancement.ts), celui qui coche aussi l'étape dans le rail.
  const estVerifie = (id: string) => mode === 'demo' || verifies.includes(id);
  const fait = useTachesConfig()[1];

  const taches: Tache[] = [
    {
      // Une fois trouvée, l'adresse s'affiche sous le libellé : on voit ce qu'EVAN a retenu.
      label: site ? (
        <>
          Trouver l’adresse
          <span className="loc-tache-detail">{site.adresse}</span>
        </>
      ) : (
        'Trouver l’adresse'
      ),
      comment: 'Tapez l’adresse de l’usine, le nom de l’entreprise ou son SIRET dans la barre sur la carte.',
      fait: fait.adresse,
    },
    {
      label: 'Choisir le bâtiment',
      comment: 'Cliquez sur le toit de l’usine, sur la photo : EVAN trace son contour.',
      fait: fait.batiment,
    },
    {
      label: batiments.length > 1 ? 'Vérifier chaque contour' : 'Vérifier le contour',
      comment: batiments.length
        ? 'Le trait orange doit suivre le bord du toit. Plus bas : « Le contour est juste », ou corrigez-le.'
        : 'Possible une fois le bâtiment choisi.',
      fait: fait.contours,
    },
    {
      label: 'Ajouter les autres bâtiments',
      comment: 'S’ils font partie de l’usine : cliquez sur leur toit, un par un.',
      fait: batiments.length > 1,
      facultatif: true,
    },
  ];

  return (
    <>
      <PanelHeader n={1} right={<GuideButton guide={GUIDE_LOCALISER} compact />} />
      <div className="panel-body stack loc-panneau">
        <div className="entree" style={cascade(0)}>
          <StepGuide taches={taches} fin="Tout est fait." />
        </div>

        {(detecting || locating) && (
          <div className="card row loc-encours" role="status">
            <Loader2 className="spin" size={16} aria-hidden />
            <span>{detecting ? 'EVAN relève le contour du bâtiment…' : locating}</span>
          </div>
        )}
        {localisation && <CandidatesCard loc={localisation} />}
        {detectError && (
          <div className="card loc-erreur" role="alert">
            <AlertTriangle aria-hidden />
            <div>
              <p>{detectError}</p>
              <button type="button" className="btn sm" onClick={() => useMapUi.getState().setMode('draw')}>
                <PenLine /> Dessiner le contour
              </button>
            </div>
          </div>
        )}

        {dessin && (
          <div className="card row loc-encours" role="status">
            <PenLine size={16} aria-hidden />
            <span>Tracé à la main en cours, sur la carte.</span>
          </div>
        )}
        {!b && !detecting && !dessin && <TrouverCard />}

        {b && m && (
          <>
            {!estVerifie(b.id) && <ContourCard b={b} verifie={false} style={cascade(1)} />}
            {/* Un bâtiment qui vient d'être relevé rejoue l'entrée de sa carte : on voit que la mesure est nouvelle. */}
            <SurfaceCard key={`${b.id}-${lastAddedId === b.id ? 'neuf' : ''}`} b={b} m={m} direct={!!live} style={cascade(2)} />
            {estVerifie(b.id) && <ContourCard b={b} verifie style={cascade(2)} />}
          </>
        )}

        {batiments.length > 0 && <BatimentsCard selectedId={selectedId} style={cascade(3)} />}
      </div>
    </>
  );
}

/**
 * Avant tout bâtiment : le conseil animé est sur la carte ; ici, les façons de trouver le bâtiment dans le « ? », et
 * le bouton du tracé à la main.
 */
function TrouverCard() {
  return (
    <section className="loc-trouver entree" style={cascade(1)} aria-labelledby="loc-trouver-titre">
      <TitreCarte
        id="loc-trouver-titre"
        titre="Pour trouver le bâtiment"
        aide="Cherchez l’adresse, l’entreprise, son SIRET, un point GPS ou un lien Google Maps ; ou zoomez sur la photo et cliquez sur le toit. Un point exact retient son bâtiment ; une rue ou l’adresse d’une entreprise en propose plusieurs, à confirmer d’un clic."
      />
      <button type="button" className="btn" onClick={() => useMapUi.getState().setMode('draw')}>
        <PenLine /> Dessiner le contour
      </button>
    </section>
  );
}
