/**
 * « Comment ça marche » : le parcours en étapes (steps.ts), raconté à quelqu'un qui découvre EVAN. Les étapes de
 * configuration se font une fois ; les dernières servent chaque jour. L'étape choisie se montre sur l'écran réel de
 * la démo, filmé (lib/clips.ts) : on voit le geste et ce qu'il produit. Un lien ouvre ensuite la même étape dans la
 * démo. Affiché dans le volet du même nom (VoletParcours), ouvert depuis l'en-tête de l'accueil.
 *
 * Tant que personne n'a cliqué, le parcours passe seul d'une étape à la suivante, à la fin de chaque vidéo ; une barre
 * suit la vidéo sous l'étape en cours. Pointeur ou focus dans le parcours, l'étape ne change plus sous les yeux de qui
 * lit : sa vidéo continue, en boucle. Un bouton met la vidéo en pause (et le défilement avec elle). Une étape choisie
 * à la main tourne en boucle. Avec les animations réduites : l'image de fin de chaque vidéo, sans lecture, et rien
 * n'avance seul.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FocusEvent } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { CONFIG_STEPS, EXPLOIT_TABS, STEPS } from '@/widgets/shell/steps';
import { useIsDark, useReducedMotion, type EtapeParcours } from '@/store/ui';
import { useMedia } from '../hooks/useMedia';
import { CLIPS, imageDebut, imageFin, video } from '../lib/clips';
import { lienDemo, situerEtape } from '../lib/parcours';
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

/** Titre du volet, sans point final comme tous les titres : « Sept étapes, de la carte à l'atelier en direct ». */
export const TITRE_PARCOURS = `${majuscule(enMots(STEPS.length))} étapes, de la carte à l’atelier en direct`;

interface PanneauProps {
  etape: Etape;
  reduit: boolean;
  /** La vidéo boucle (étape choisie à la main, ou lecteur retenu) ; sinon sa fin passe à l'étape suivante. */
  boucle: boolean;
  /** Arrêtée par le visiteur, avec le bouton du panneau. */
  enPause: boolean;
  basculerPause(): void;
  onFin(): void;
  /** Avancement de la vidéo (0 à 1), à chaque image, pour la barre de l'étape. */
  onAvance(k: number): void;
}

function Panneau({ etape, reduit, boucle, enPause, basculerPause, onFin, onAvance }: PanneauProps) {
  const clip = CLIPS[etape.n];
  // La vidéo est tournée dans les deux thèmes : celle du thème de la page.
  const jour = !useIsDark();
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

  // Pas d'annonce automatique : la légende change toutes les dix secondes pendant le défilement, un lecteur d'écran
  // la relirait sans fin. Le bouton de l'étape dit déjà laquelle est montrée (aria-current).
  return (
    <figure className="pc-panneau" id={PANNEAU_ID}>
      {/* Clé = étape : la vidéo repart du début, son entrée se rejoue à chaque changement. */}
      <div className={`pc-ecran ${prete || reduit ? 'is-prete' : ''}`} key={etape.n}>
        {reduit ? (
          <img className="pc-video" src={imageFin(clip, jour)} alt="" width={1120} height={700} />
        ) : (
          <video
            ref={lecteur}
            className="pc-video"
            src={video(clip, jour)}
            poster={imageDebut(clip, jour)}
            width={1120}
            height={700}
            muted
            playsInline
            autoPlay={!enPause}
            preload="auto"
            loop={boucle}
            disablePictureInPicture
            aria-hidden="true"
            onPlaying={() => setPrete(true)}
            onEnded={onFin}
          />
        )}
      </div>
      <figcaption>
        <div className="pc-panneau-tete">
          {/* Même clé : la légende change avec la vidéo, ses lignes montent l'une après l'autre. */}
          <span className="pc-panneau-n" key={`n-${etape.n}`}>
            {situerEtape(etape.n)}
          </span>
          {/* Hors des éléments à clé : le bouton garde le focus quand l'étape change. */}
          {!reduit && (
            <button
              type="button"
              className="btn sm icon ghost pc-lecture"
              onClick={basculerPause}
              aria-label={enPause ? 'Lire la vidéo' : 'Mettre la vidéo en pause'}
              title={enPause ? 'Lire' : 'Pause'}
            >
              {enPause ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            </button>
          )}
        </div>
        <p key={`p-${etape.n}`}>{etape.pourquoi}</p>
        <Link to={lienDemo(etape.n)} className="pc-panneau-lien" key={`l-${etape.n}`}>
          Voir cette étape dans la démo
          <ArrowRight aria-hidden="true" />
        </Link>
      </figcaption>
    </figure>
  );
}

export function Parcours() {
  const [actif, setActif] = useState<EtapeParcours>(1);
  const [auto, setAuto] = useState(true);
  const [enPause, setEnPause] = useState(false);
  // Pointeur ou focus dans le parcours : quelqu'un lit, l'étape ne change pas sous ses yeux.
  const [survol, setSurvol] = useState(false);
  const [focusDedans, setFocusDedans] = useState(false);
  const reduit = useReducedMotion();
  const etroit = useMedia('(max-width: 900px)');
  const racine = useRef<HTMLDivElement>(null);
  const etapeActive = useRef<HTMLLIElement>(null);
  // Étape touchée sur un volet étroit : sa vidéo s'ouvre dessous et celle d'avant se referme, la liste se décale.
  const aRamener = useRef(false);
  // Volet étroit : la vidéo s'ouvre sous l'étape ; le faire avancer seul ferait sauter le volet pendant la lecture.
  const defile = auto && !reduit && !etroit;
  const retenu = survol || focusDedans;
  const etape = STEPS.find((s) => s.n === actif) ?? STEPS[0];

  const choisir = (n: EtapeParcours) => {
    setAuto(false);
    aRamener.current = etroit && n !== actif;
    setActif(n);
  };
  const suivante = () => {
    if (!defile || retenu) return;
    if (actif >= DERNIERE) return setAuto(false);
    setActif((actif + 1) as EtapeParcours);
  };
  // La barre de l'étape en cours suit la vidéo, sans rendu React : une variable CSS posée à chaque image.
  const avance = useCallback((k: number) => racine.current?.style.setProperty('--pc-avance', k.toFixed(4)), []);
  useEffect(() => avance(0), [actif, avance]);

  // L'étape touchée revient en haut du volet, sa vidéo dessous : la liste ne file pas sous le doigt.
  useLayoutEffect(() => {
    if (!aRamener.current) return;
    aRamener.current = false;
    etapeActive.current?.scrollIntoView({ block: 'start', behavior: reduit ? 'auto' : 'smooth' });
  }, [actif, reduit]);

  const quitterFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusDedans(false);
  };

  const panneau = (s: Etape) => (
    <Panneau
      etape={s}
      reduit={reduit}
      boucle={!defile || retenu}
      enPause={enPause}
      basculerPause={() => setEnPause((p) => !p)}
      onFin={suivante}
      onAvance={avance}
    />
  );

  const ligne = (s: Etape) => {
    const on = s.n === actif;
    return (
      <li key={s.n} ref={on ? etapeActive : undefined} className={`pc-etape ${on ? 'on' : ''} ${s.n < actif ? 'passee' : ''}`}>
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
    <div
      ref={racine}
      className="pc"
      onMouseEnter={() => setSurvol(true)}
      onMouseLeave={() => setSurvol(false)}
      onFocus={() => setFocusDedans(true)}
      onBlur={quitterFocus}
    >
      <div className="pc-gauche">
        <p className="pc-chapo">
          Les {enMots(UNE_FOIS.length)} premières se font une fois, pour décrire l’usine. Les {enMots(CHAQUE_JOUR.length)} dernières servent
          tous les jours.
        </p>

        <div className="pc-liste">
          {etroit && <p className="pc-astuce">Touchez une étape pour voir sa vidéo.</p>}
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
