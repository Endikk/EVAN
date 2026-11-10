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

/** Désigne un bloc de l'écran : il défile jusqu'à lui et s'entoure un instant d'un halo. */
export function montrerBloc(cible: string) {
  const el = document.querySelector<HTMLElement>(`[data-guide="${CSS.escape(cible)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: isReducedMotion() ? 'auto' : 'smooth', block: 'center' });
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

function Volet({ guide, fermer }: { guide: GuideEcran; fermer: () => void }) {
  const titreId = useId();
  const fermerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    fermerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && fermer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fermer]);

  return createPortal(
    <div className="guide-fond" onMouseDown={fermer}>
      <aside className="guide-volet" role="dialog" aria-modal="true" aria-labelledby={titreId} onMouseDown={(e) => e.stopPropagation()}>
        <header className="guide-tete">
          <span className="guide-icone" aria-hidden>
            <BookOpen />
          </span>
          <div className="grow">
            <p className="guide-sur">Comment lire cet écran</p>
            <h2 id={titreId}>{guide.titre}</h2>
          </div>
          <button ref={fermerRef} className="btn sm icon ghost" onClick={fermer} aria-label="Fermer l’explication" title="Fermer (Échap)">
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
                      onClick={() => {
                        fermer();
                        window.setTimeout(() => montrerBloc(b.cible!), 120);
                      }}
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

  const ouvrir = () => {
    setOuvert(true);
    if (nouveau) {
      marquerVu(guide.id);
      setNouveau(false);
    }
  };
  const fermer = useCallback(() => {
    setOuvert(false);
    bouton.current?.focus();
  }, []);

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
      {ouvert && <Volet guide={guide} fermer={fermer} />}
    </>
  );
}
