/**
 * « Comment lire cet écran » : un bouton qui ouvre un volet sur la droite. Le volet reprend chaque bloc de l'écran
 * dans l'ordre, dit en clair ce qu'il montre, et peut le désigner sur l'écran (« Montrer »). En bas, les mots du
 * métier utilisés sur l'écran.
 *
 * À la première visite d'un écran, une pastille sur le bouton signale que l'explication existe.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Crosshair, X } from 'lucide-react';
import { isReducedMotion } from '@/store/ui';
import { usePiegeFocus } from '@/ui/usePiegeFocus';
import { GLOSSAIRE, type TermeCle } from './glossaire';
import { DefinitionTerme } from './Term';

export interface GuideBloc {
  titre: string;
  texte: ReactNode;
  /** Valeur de l'attribut data-guide du bloc à désigner sur l'écran. */
  cible?: string;
  /** Petite illustration animée, facultative. */
  schema?: ReactNode;
}

export interface GuideEcran {
  /** Clé de l'écran, pour ne signaler l'explication qu'à la première visite. */
  id: string;
  titre: string;
  resume: ReactNode;
  blocs: GuideBloc[];
  termes?: TermeCle[];
}

const DUREE_SPOT_MS = 2400;

/** Ce qu'on lit d'un bloc candidat : de quoi choisir le bon sans navigateur. */
export interface CandidatBloc {
  /** Dans une couche masquée (inert, aria-hidden) ou sans boîte à l'écran. */
  cache: boolean;
}

/**
 * Le bloc à désigner parmi ceux qui portent la même clé : le premier qui se voit. La carte satellite reste montée
 * sous les écrans en pleine page ; un bloc qui porte la même clé qu'elle ne doit pas la désigner.
 */
export function choisirBloc<T extends CandidatBloc>(candidats: T[]): T | undefined {
  return candidats.find((c) => !c.cache);
}

function estCache(el: HTMLElement): boolean {
  if (el.closest('[inert], [aria-hidden="true"], .stage-layer.hidden')) return true;
  return el.getClientRects().length === 0;
}

/** Ouvre le bloc replié (« Voir les chiffres détaillés ») qui porte ou contient la cible. */
function deplier(el: HTMLElement) {
  const ferme = el.closest<HTMLElement>('.details:not(.ouvert)') ?? el.querySelector<HTMLElement>(':scope > .details:not(.ouvert)');
  ferme?.querySelector<HTMLButtonElement>(':scope > .details-tete')?.click();
}

/**
 * Désigne un bloc de l'écran : il s'ouvre s'il était replié, défile jusqu'à lui, prend le focus (le clavier repart
 * de là) et s'entoure un instant d'un halo. Un bloc plus haut que l'écran se cale par son haut, pas par son milieu.
 */
export function montrerBloc(cible: string) {
  const tous = [...document.querySelectorAll<HTMLElement>(`[data-guide="${CSS.escape(cible)}"]`)];
  const el = choisirBloc(tous.map((x) => ({ x, cache: estCache(x) })))?.x;
  if (!el) return;
  deplier(el);
  const haut = el.getBoundingClientRect().height;
  el.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: haut > window.innerHeight * 0.8 ? 'start' : 'center' });
  if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
  el.focus({ preventScroll: true });
  el.classList.remove('guide-spot');
  // Relance l'animation si le même bloc est désigné deux fois de suite.
  void el.offsetWidth;
  el.classList.add('guide-spot');
  window.setTimeout(() => el.classList.remove('guide-spot'), DUREE_SPOT_MS);
}

function dejaVu(id: string): boolean {
  try {
    return localStorage.getItem(`evan.guide.${id}`) === '1';
  } catch {
    return true;
  }
}

function marquerVu(id: string) {
  try {
    localStorage.setItem(`evan.guide.${id}`, '1');
  } catch {
    /* navigation privée : la pastille reviendra, sans gravité */
  }
}

function Volet({ guide, fermer, montrer }: { guide: GuideEcran; fermer: () => void; montrer: (cible: string) => void }) {
  const titreId = useId();
  const volet = useRef<HTMLElement>(null);
  // Piège de focus : Tab reste dans le volet, Échap le ferme (sauf si une bulle de mot ouverte l'a déjà consommé),
  // le focus revient au bouton « Comment lire cet écran ».
  usePiegeFocus(volet, true, fermer);

  return createPortal(
    <div className="guide-fond" onMouseDown={fermer}>
      <aside ref={volet} className="guide-volet" role="dialog" aria-modal="true" aria-labelledby={titreId} onMouseDown={(e) => e.stopPropagation()}>
        <header className="guide-tete">
          <span className="guide-icone" aria-hidden>
            <BookOpen />
          </span>
          <div className="grow">
            <p className="guide-sur">Comment lire cet écran</p>
            <h2 id={titreId}>{guide.titre}</h2>
          </div>
          <button data-autofocus className="btn sm icon ghost" onClick={fermer} aria-label="Fermer l’explication" title="Fermer (Échap)">
            <X />
          </button>
        </header>
        <div className="guide-corps">
          <p className="guide-resume">{guide.resume}</p>
          <ol className="guide-blocs">
            {guide.blocs.map((b, i) => (
              <li key={b.titre} style={{ ['--i' as string]: i }}>
                <div className="guide-bloc-tete">
                  <h3>{b.titre}</h3>
                  {b.cible && (
                    <button
                      className="btn sm ghost guide-montrer"
                      onClick={() => montrer(b.cible!)}
                    >
                      <Crosshair /> Montrer
                    </button>
                  )}
                </div>
                {b.schema && <div className="guide-schema">{b.schema}</div>}
                <div className="guide-texte">{b.texte}</div>
              </li>
            ))}
          </ol>
          {guide.termes && guide.termes.length > 0 && (
            <section className="guide-termes" aria-label="Les mots de cet écran">
              <h3>Les mots de cet écran</h3>
              <dl>
                {guide.termes.map((k) => (
                  <div key={k} className="guide-terme">
                    <DefinitionTerme t={GLOSSAIRE[k]} />
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

export function GuideButton({ guide, compact = false }: { guide: GuideEcran; compact?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [nouveau, setNouveau] = useState(() => !dejaVu(guide.id));
  const bouton = useRef<HTMLButtonElement>(null);
  // Bloc à désigner une fois le volet fermé : le focus rendu au bouton par le piège passe ensuite au bloc.
  const aMontrer = useRef<string | null>(null);

  const ouvrir = () => {
    setOuvert(true);
    if (nouveau) {
      marquerVu(guide.id);
      setNouveau(false);
    }
  };
  const fermer = useCallback(() => setOuvert(false), []);
  const montrer = useCallback((cible: string) => {
    aMontrer.current = cible;
    setOuvert(false);
  }, []);

  useEffect(() => {
    if (ouvert || !aMontrer.current) return;
    const cible = aMontrer.current;
    aMontrer.current = null;
    const t = window.setTimeout(() => montrerBloc(cible), 120);
    return () => window.clearTimeout(t);
  }, [ouvert]);

  return (
    <>
      <button
        ref={bouton}
        type="button"
        className={`btn sm guide-btn ${compact ? 'icon' : ''} ${nouveau ? 'nouveau' : ''}`}
        onClick={ouvrir}
        aria-haspopup="dialog"
        aria-label={compact ? 'Comment lire cet écran' : undefined}
        title="Ce que montre chaque bloc de l’écran, en clair"
      >
        <BookOpen />
        {!compact && <span>Comment lire cet écran</span>}
        {nouveau && <i className="guide-pastille" aria-hidden />}
      </button>
      {ouvert && <Volet guide={guide} fermer={fermer} montrer={montrer} />}
    </>
  );
}
