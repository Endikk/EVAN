/**
 * Mot du métier souligné en pointillés : survol, focus ou toucher ouvre ce qu'il veut dire (glossaire).
 * <Term k="trs" /> affiche « TRS » ; <Term k="trs">le rendement</Term> garde le texte donné.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSAIRE, type TermeCle, type Terme } from './glossaire';
import { useBulle } from './useBulle';

const LARGEUR = 300;

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
  const id = useId();
  const fermer = useCallback(() => setOuverte(false), []);
  const pos = useBulle(ancre, ouverte, fermer, LARGEUR);

  return (
    <>
      <button
        ref={ancre}
        type="button"
        className="terme"
        aria-expanded={ouverte}
        aria-describedby={ouverte ? id : undefined}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setOuverte(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setOuverte(false)}
        onFocus={(e) => e.currentTarget.matches(':focus-visible') && setOuverte(true)}
        onBlur={fermer}
        onClick={(e) => {
          e.stopPropagation();
          if ((e.nativeEvent as PointerEvent).pointerType === 'mouse') setOuverte(true);
          else setOuverte((v) => !v);
        }}
      >
        {children ?? t.mot}
      </button>
      {ouverte &&
        pos &&
        createPortal(
          <div id={id} role="tooltip" className="bulle-terme" style={{ ...pos, width: LARGEUR }}>
            <DefinitionTerme t={t} />
          </div>,
          document.body,
        )}
    </>
  );
}
