/**
 * Mot du métier souligné en pointillés : survol, focus ou toucher ouvre ce qu'il veut dire (glossaire).
 * <Term k="trs" /> affiche « TRS » ; <Term k="trs">le rendement</Term> garde le texte donné.
 *
 * Comme la bulle d'InfoTip, on peut passer la souris du mot à la bulle sans qu'elle se ferme, et elle suit le mot
 * quand la page défile (WCAG 1.4.13).
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSAIRE, type TermeCle, type Terme } from './glossaire';
import { useBulle } from './useBulle';

const LARGEUR = 300;
/** Délai avant fermeture quand la souris quitte le mot : le temps de rejoindre la bulle. */
const SORTIE_MS = 140;

export function DefinitionTerme({ t }: { t: Terme }) {
  return (
    <>
      <b className="terme-mot">
        {t.mot}
        {t.long && <span className="terme-long"> · {t.long}</span>}
      </b>
      <p>{t.sens}</p>
      {t.lecture && <p className="terme-lecture">{t.lecture}</p>}
    </>
  );
}

export function Term({ k, children }: { k: TermeCle; children?: ReactNode }) {
  const t: Terme = GLOSSAIRE[k];
  const [ouverte, setOuverte] = useState(false);
  const ancre = useRef<HTMLButtonElement>(null);
  const bulle = useRef<HTMLDivElement>(null);
  const minuterie = useRef(0);
  const id = useId();
  const fermer = useCallback(() => {
    window.clearTimeout(minuterie.current);
    setOuverte(false);
  }, []);
  const ouvrir = useCallback(() => {
    window.clearTimeout(minuterie.current);
    setOuverte(true);
  }, []);
  const fermerBientot = useCallback(() => {
    window.clearTimeout(minuterie.current);
    minuterie.current = window.setTimeout(() => setOuverte(false), SORTIE_MS);
  }, []);
  const pos = useBulle(ancre, ouverte, fermer, LARGEUR, bulle);
  useEffect(() => () => window.clearTimeout(minuterie.current), []);

  return (
    <>
      <button
        ref={ancre}
        type="button"
        className="terme"
        aria-expanded={ouverte}
        aria-describedby={ouverte ? id : undefined}
        onPointerEnter={(e) => e.pointerType === 'mouse' && ouvrir()}
        onPointerLeave={(e) => e.pointerType === 'mouse' && fermerBientot()}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && ouvrir()}
        onBlur={fermer}
        onClick={(e) => {
          e.stopPropagation();
          if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') ouvrir();
          else setOuverte((v) => !v);
        }}
      >
        {children ?? t.mot}
      </button>
      {ouverte &&
        pos &&
        createPortal(
          <div
            ref={bulle}
            id={id}
            role="tooltip"
            className="bulle-terme"
            style={{ ...pos, width: LARGEUR }}
            onPointerEnter={(e) => e.pointerType === 'mouse' && ouvrir()}
            onPointerLeave={(e) => e.pointerType === 'mouse' && fermerBientot()}
          >
            <DefinitionTerme t={t} />
          </div>,
          document.body,
        )}
    </>
  );
}
