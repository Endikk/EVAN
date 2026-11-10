import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Box, CircleHelp, Eye, EyeOff, Image, Map as MapIcon, Maximize, Minus, Pause, Play, Plus, SkipBack, SkipForward, Square, X } from 'lucide-react';
import { useUi, enPleinePage } from '@/store/ui';
import { useProject } from '@/store/project';
import { switchView, zoomPlan } from '@/widgets/scene/planView';
import { useMapUi } from '@/widgets/carte/mapState';
import { useSceneUi } from '@/widgets/scene/sceneState';
import { formatNumber } from '@/geo/geodesy';
import { CHAPITRES, pauseTour, startTour, stopTour } from '@/widgets/tour/tour';
import { StatusIcon, ETAT_FORME, ETAT_LIBELLE, ETAT_SENS } from '@/ui/status';
import type { EtatMachine } from '@/domain/types';

/** Légende narrée de la visite guidée : chapitres en pastilles (un clic y saute), précédent, pause, suivant. */
export function CaptionBar() {
  const tour = useUi((s) => s.tour);
  if (!tour.caption) return null;
  const n = tour.chapitre ?? 1;
  return (
    <div className={`caption glass ${tour.playing ? '' : 'paused'}`} role="status" aria-live="polite">
      <div className="txt">
        <b>{tour.caption}</b>
        {tour.sub && <span>{tour.sub}</span>}
        <div className="tour-dots" role="group" aria-label="Chapitres de la visite">
          {CHAPITRES.map((c, i) => (
            <button
              key={c.titre}
              className={i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}
              aria-current={i + 1 === n ? 'step' : undefined}
              aria-label={`Chapitre ${i + 1} : ${c.titre}`}
              title={`${i + 1}. ${c.titre}`}
              onClick={() => void startTour(i + 1)}
            />
          ))}
          <small className="num">
            Chapitre {n} sur {CHAPITRES.length} · {CHAPITRES[n - 1]?.titre}
            {!tour.playing && ' · en pause'}
          </small>
        </div>
      </div>
      <div className="caption-ctl">
        <button className="btn sm icon ghost" disabled={n <= 1} onClick={() => void startTour(n - 1)} aria-label="Chapitre précédent" title="Revenir au chapitre précédent">
          <SkipBack />
        </button>
        <button
          className="btn sm icon"
          onClick={() => (tour.playing ? pauseTour() : void startTour(n))}
          aria-label={tour.playing ? 'Mettre la visite en pause' : 'Reprendre la visite'}
          title={tour.playing ? 'Mettre en pause : vous gardez la main sur l’écran' : 'Reprendre ce chapitre depuis son début'}
        >
          {tour.playing ? <Pause /> : <Play />}
        </button>
        <button className="btn sm icon ghost" disabled={n >= CHAPITRES.length} onClick={() => void startTour(n + 1)} aria-label="Chapitre suivant" title="Passer au chapitre suivant">
          <SkipForward />
        </button>
        <button className="btn sm icon ghost" onClick={() => stopTour()} aria-label="Fermer la visite" title="Fermer la visite (elle se relance depuis le menu ⋯)">
          <X />
        </button>
      </div>
    </div>
  );
}

const ECHELLES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

/** Plan 2D : barre d'échelle (au pixel près : la caméra est orthographique), nord géographique, zoom. */
function PlanHud() {
  const zoom = useSceneUi((s) => s.planZoom);
  const angle = useProject((s) => s.site?.repere.angleDeg ?? 0);
  const L = ECHELLES.find((l) => l * zoom >= 64) ?? 500;
  return (
    <div className="hud br plan-hud">
      <div className="scalebar glass" aria-label={`Échelle : ${L} mètres`}>
        <i style={{ width: L * zoom }} />
        <span>{L} m</span>
      </div>
      <div className="compass glass" title="La flèche rouge montre le nord" aria-label="Nord géographique">
        <svg viewBox="-20 -20 40 40" style={{ transform: `rotate(${angle}deg)` }} aria-hidden>
          <path d="M0 -15 L5.5 3 L0 0 L-5.5 3 Z" fill="var(--crit)" />
          <path d="M0 15 L5.5 3 L0 0 L-5.5 3 Z" fill="var(--text-3)" />
        </svg>
        <b style={{ transform: `rotate(${angle}deg) translateY(-18px) rotate(${-angle}deg)` }}>N</b>
      </div>
      <div className="zoomctl glass" role="group" aria-label="Zoom du plan">
        <button onClick={() => zoomPlan(1.45)} aria-label="Zoomer" title="Rapprocher le plan (ou molette)">
          <Plus />
        </button>
        <button onClick={() => zoomPlan(1 / 1.45)} aria-label="Dézoomer" title="Éloigner le plan (ou molette)">
          <Minus />
        </button>
        <button onClick={() => zoomPlan('fit')} aria-label="Voir tout le site" title="Recadrer sur tout le site">
          <Maximize />
        </button>
      </div>
    </div>
  );
}

const ETATS: EtatMachine[] = ['marche', 'attention', 'panne', 'calage', 'arret'];

/**
 * Légende des états, posée sur la scène : chaque forme avec son nom. Le survol, le focus ou un clic ouvrent un petit
 * volet qui dit ce que chaque état veut dire pour l'atelier (« Calage : la machine est en réglage, elle ne produit pas »).
 */
function LegendeEtats() {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);
  const id = useId();
  const fermer = useCallback(() => setOuvert(false), []);

  useEffect(() => {
    if (!ouvert) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
    const onDown = (e: PointerEvent) => !racine.current?.contains(e.target as Node) && fermer();
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [ouvert, fermer]);

  return (
    <div
      className="legende-etats"
      ref={racine}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOuvert(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOuvert(false)}
    >
      {ouvert && (
        <div className="legende-volet" id={id} role="region" aria-label="Ce que veulent dire les formes">
          <h3>Ce que veulent dire les formes</h3>
          <p>Chaque machine porte une étiquette. Sa forme et sa couleur disent ce qu’elle fait en ce moment.</p>
          <dl>
            {ETATS.map((e, i) => (
              <div key={e} className="legende-ligne" style={{ ['--i' as string]: i }}>
                <dt>
                  <StatusIcon etat={e} size={14} />
                  <b>
                    {ETAT_LIBELLE[e]}
                    <small>{ETAT_FORME[e]}</small>
                  </b>
                </dt>
                <dd>{ETAT_SENS[e]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <button
        type="button"
        className="legende-barre glass"
        aria-expanded={ouvert}
        aria-controls={ouvert ? id : undefined}
        onClick={(e) => {
          // À la souris, le survol a déjà ouvert le volet : le clic le garde ; au toucher et au clavier, il bascule.
          if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') setOuvert(true);
          else setOuvert((v) => !v);
        }}
        title="Ce que veulent dire les formes et les couleurs des machines"
      >
        {ETATS.map((e) => (
          <span key={e} className="legende-item">
            <StatusIcon etat={e} size={10} animate={false} /> <span>{ETAT_LIBELLE[e]}</span>
          </span>
        ))}
        <span className="legende-aide">
          <CircleHelp aria-hidden />
          <span className="sr-only">Ce que veulent dire les formes</span>
        </span>
      </button>
    </div>
  );
}

/** Commandes flottantes de la scène : bascule 3D/2D, fond du plan, étiquettes, légende des états, zoom de la carte. */
export function StageHud() {
  const step = useUi((s) => s.step);
  const view = useUi((s) => s.view);
  const showLabels = useUi((s) => s.showLabels);
  const zoom = useMapUi((s) => s.zoom);
  const mpp = useMapUi((s) => s.mpp);
  const rotating = useSceneUi((s) => s.rotating);
  const planFond = useSceneUi((s) => s.planFond);

  if (step === 1) {
    const echelle = mpp < 1 ? `${formatNumber(mpp * 100, 0)} cm` : `${formatNumber(mpp, 1)} m`;
    return (
      <div className="hud bl" style={{ bottom: 40 }}>
        <div className="glass hud-echelle" title={`Niveau de zoom de la carte : ${formatNumber(zoom, 1)}`}>
          Un pixel à l’écran vaut <b>{echelle}</b> au sol
          {zoom < 15 && <span> · zoomez pour voir les bâtiments</span>}
        </div>
      </div>
    );
  }
  if (enPleinePage(step)) return null;
  return (
    <>
      {rotating && (
        <div className="hud" style={{ top: 16, left: '50%', transform: 'translateX(-50%)' }}>
          <div className="rot-angle" style={{ fontSize: 14, padding: '8px 12px' }}>
            {rotating.numero} · {Math.round(rotating.deg)}°
          </div>
        </div>
      )}
      <div className="hud tl">
        <div className="seg glass" role="group" aria-label="Vue de la scène">
          <button aria-pressed={view === '3d'} onClick={() => void switchView('3d')} title="Vue en relief : faites tourner l’atelier pour voir les machines">
            <Box aria-hidden /> 3D
          </button>
          <button aria-pressed={view === '2d'} onClick={() => void switchView('2d')} title="Plan vu de dessus, à l’échelle, avec les cotes des murs">
            <Square aria-hidden /> 2D
          </button>
        </div>
        {view === '2d' && (
          <div className="seg glass" role="group" aria-label="Fond du plan">
            <button aria-pressed={planFond === 'plan'} onClick={() => useSceneUi.getState().set({ planFond: 'plan' })} title="Fond uni : le plan seul, le plus lisible">
              <MapIcon aria-hidden /> <span className="hud-libelle">Plan</span>
            </button>
            <button aria-pressed={planFond === 'satellite'} onClick={() => useSceneUi.getState().set({ planFond: 'satellite' })} title="Photo aérienne sous le plan">
              <Image aria-hidden /> <span className="hud-libelle">Satellite</span>
            </button>
          </div>
        )}
        <button
          className="btn sm glass hud-etiquettes"
          onClick={() => useUi.getState().setShowLabels(!showLabels)}
          aria-pressed={showLabels}
          aria-label={showLabels ? 'Masquer les étiquettes des machines' : 'Afficher les étiquettes des machines'}
          title={showLabels ? 'Masquer les étiquettes des machines et des zones' : 'Afficher les étiquettes des machines et des zones'}
        >
          {showLabels ? <Eye aria-hidden /> : <EyeOff aria-hidden />} <span className="hud-libelle">Étiquettes</span>
        </button>
      </div>
      {view === '2d' && <PlanHud />}
      {step >= 4 && (
        <div className="hud bl">
          <LegendeEtats />
        </div>
      )}
    </>
  );
}
