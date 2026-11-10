/**
 * « Comment ça marche » : le parcours en étapes (steps.ts), raconté à quelqu'un qui découvre EVAN. Les étapes de
 * configuration se font une fois ; les dernières servent chaque jour. L'étape choisie se montre sur l'écran réel de
 * la démo, filmé (lib/clips.ts) : on voit le geste et ce qu'il produit. Affiché dans le volet du même nom
 * (VoletParcours), ouvert depuis l'en-tête de l'accueil.
 *
 * Tant que personne n'a cliqué, le parcours passe seul d'une étape à la suivante, à la fin de chaque vidéo ; une barre
 * suit la vidéo sous l'étape en cours. Le survol met la vidéo en pause. Une étape choisie à la main tourne en boucle.
 * Avec les animations réduites : l'image de fin de chaque vidéo, sans lecture, et rien n'avance seul.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG_STEPS, EXPLOIT_TABS, STEPS } from '@/widgets/shell/steps';
import { useReducedMotion, type EtapeParcours } from '@/store/ui';
import { useMedia } from '../hooks/useMedia';
import { CLIPS, imageDebut, imageFin, video } from '../lib/clips';
import './Parcours.css';

const PANNEAU_ID = 'pc-panneau';

const MOTS = ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'];
const enMots = (n: number) => MOTS[n] ?? String(n);
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const minuscule = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Etape = (typeof STEPS)[number];

const UNE_FOIS = CONFIG_STEPS;
const CHAQUE_JOUR = STEPS.filter((s) => !UNE_FOIS.includes(s));
/** Écrans d'exploitation qui ne sont pas des étapes du parcours (maintenance, énergie). */
const EN_PLUS = EXPLOIT_TABS.filter((t) => !STEPS.some((s) => s.n === t.n));
const DERNIERE = STEPS[STEPS.length - 1].n;

/** Titre du volet : « Sept étapes, de la carte à l'atelier en direct. » */
export const TITRE_PARCOURS = `${majuscule(enMots(STEPS.length))} étapes, de la carte à l’atelier en direct.`;

interface PanneauProps {
  etape: Etape;
  reduit: boolean;
  /** Défilement automatique : la vidéo joue une fois, sa fin passe à l'étape suivante. Sinon, elle boucle. */
  auto: boolean;
  enPause: boolean;
  onFin(): void;
  /** Avancement de la vidéo (0 à 1), à chaque image, pour la barre de l'étape. */
  onAvance(k: number): void;
}

function Panneau({ etape, reduit, auto, enPause, onFin, onAvance }: PanneauProps) {
  const clip = CLIPS[etape.n];
  const lecteur = useRef<HTMLVideoElement>(null);
  const [prete, setPrete] = useState(false);

  useEffect(() => {
    const v = lecteur.current;
    if (!v || reduit) return;
    if (enPause) v.pause();
    // Lecture refusée (économie d'énergie, onglet en arrière-plan) : l'image de début reste, sans erreur.
    else void v.play().catch(() => undefined);
  }, [enPause, reduit, etape.n]);

  useEffect(() => {
    const v = lecteur.current;
    if (!v || reduit) return;
    let image = 0;
    const suivre = () => {
      if (v.duration > 0) onAvance(v.currentTime / v.duration);
      image = requestAnimationFrame(suivre);
    };
    image = requestAnimationFrame(suivre);
    return () => cancelAnimationFrame(image);
  }, [onAvance, reduit, etape.n]);

  return (
    <figure className="pc-panneau" id={PANNEAU_ID} aria-live="polite">
      {/* Clé = étape : la vidéo repart du début, son entrée se rejoue à chaque changement. */}
      <div className={`pc-ecran ${prete || reduit ? 'is-prete' : ''}`} key={etape.n}>
        {reduit ? (
          <img className="pc-video" src={imageFin(clip)} alt="" width={1120} height={700} />
        ) : (
          <video
            ref={lecteur}
            className="pc-video"
            src={video(clip)}
            poster={imageDebut(clip)}
            width={1120}
            height={700}
            muted
            playsInline
            autoPlay
            preload="auto"
            loop={!auto}
            disablePictureInPicture
            aria-hidden="true"
            onPlaying={() => setPrete(true)}
            onEnded={onFin}
          />
        )}
      </div>
      {/* Même clé : la légende change avec la vidéo, ses deux lignes montent l'une après l'autre. */}
      <figcaption key={`legende-${etape.n}`}>
        <span className="pc-panneau-n">
          Étape {etape.n} sur {STEPS.length} · {etape.titre}
        </span>
        <p>{etape.pourquoi}</p>
      </figcaption>
    </figure>
  );
}

export function Parcours() {
  const [actif, setActif] = useState<EtapeParcours>(1);
  const [auto, setAuto] = useState(true);
  const [survol, setSurvol] = useState(false);
  const reduit = useReducedMotion();
  const etroit = useMedia('(max-width: 900px)');
  const racine = useRef<HTMLDivElement>(null);
  // Volet étroit : la vidéo s'ouvre sous l'étape ; le faire avancer seul ferait sauter le volet pendant la lecture.
  const defile = auto && !reduit && !etroit;
  const etape = STEPS.find((s) => s.n === actif) ?? STEPS[0];

  const choisir = (n: EtapeParcours) => {
    setAuto(false);
    setActif(n);
  };
  const suivante = () => {
    if (!defile) return;
    if (actif >= DERNIERE) return setAuto(false);
    setActif((actif + 1) as EtapeParcours);
  };
  // La barre de l'étape en cours suit la vidéo, sans rendu React : une variable CSS posée à chaque image.
  const avance = useCallback((k: number) => racine.current?.style.setProperty('--pc-avance', k.toFixed(4)), []);
  useEffect(() => avance(0), [actif, avance]);

  const panneau = (s: Etape) => (
    <Panneau etape={s} reduit={reduit} auto={defile} enPause={defile && survol} onFin={suivante} onAvance={avance} />
  );

  const ligne = (s: Etape) => {
    const on = s.n === actif;
    return (
      <li key={s.n} className={`pc-etape ${on ? 'on' : ''} ${s.n < actif ? 'passee' : ''}`}>
        <button type="button" className="pc-bouton" aria-current={on ? 'step' : undefined} aria-controls={PANNEAU_ID} onClick={() => choisir(s.n)}>
          <span className="pc-num" aria-hidden="true">
            {s.n}
          </span>
          <span className="pc-texte">
            <span className="pc-titre">
              <span className="sr-only">Étape {s.n} : </span>
              {s.titre}
            </span>
            <span className="pc-action">{s.action}</span>
          </span>
          {on && defile && <i className="pc-barre" aria-hidden="true" />}
        </button>
        {on && etroit && panneau(s)}
      </li>
    );
  };

  return (
    <div ref={racine} className="pc" onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}>
      <div className="pc-gauche">
        <p className="pc-chapo">
          Les {enMots(UNE_FOIS.length)} premières se font une fois, pour décrire l’usine. Les {enMots(CHAQUE_JOUR.length)} dernières servent
          tous les jours.
        </p>

        <div className="pc-liste">
          {etroit && <p className="pc-astuce">Touchez une étape pour la voir dans la démo.</p>}
          <h3 className="pc-phase">Une fois, au départ</h3>
          <ol>{UNE_FOIS.map(ligne)}</ol>
          <h3 className="pc-phase">Ensuite, chaque jour</h3>
          <ol start={CHAQUE_JOUR[0]?.n}>{CHAQUE_JOUR.map(ligne)}</ol>
          {EN_PLUS.length > 0 && (
            <p className="pc-plus">
              Au quotidien, {enMots(EN_PLUS.length)} écrans de plus :{' '}
              {EN_PLUS.map((t, i) => (
                <span key={t.n}>
                  {i > 0 && ' ; '}
                  <b>{t.titre}</b>, pour {minuscule(t.action)}
                </span>
              ))}
              .
            </p>
          )}
        </div>
      </div>
      {!etroit && panneau(etape)}
    </div>
  );
}
