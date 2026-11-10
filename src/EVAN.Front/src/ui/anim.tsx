/**
 * Petites animations qui expliquent un changement : un nombre qui monte jusqu'à sa valeur montre qu'il vient d'être
 * calculé ou qu'il a bougé. Animations réduites : la valeur s'affiche directement.
 */
import { useEffect, useRef, useState } from 'react';
import { isReducedMotion } from '@/store/ui';

const DUREE_MS = 700;

const sortie = (t: number) => 1 - Math.pow(1 - t, 3);

/** Valeur affichée qui rejoint `cible` en `duree` ms, à chaque changement de la cible. */
export function useCountUp(cible: number, duree = DUREE_MS): number {
  const [affiche, setAffiche] = useState(() => (isReducedMotion() ? cible : 0));
  const depart = useRef(affiche);

  useEffect(() => {
    if (!Number.isFinite(cible)) return setAffiche(cible);
    if (isReducedMotion()) {
      depart.current = cible;
      return setAffiche(cible);
    }
    const de = depart.current;
    const t0 = performance.now();
    let raf = 0;
    const pas = (t: number) => {
      const p = Math.min(1, (t - t0) / duree);
      const v = de + (cible - de) * sortie(p);
      depart.current = v;
      setAffiche(v);
      if (p < 1) raf = requestAnimationFrame(pas);
    };
    raf = requestAnimationFrame(pas);
    return () => cancelAnimationFrame(raf);
  }, [cible, duree]);

  return affiche;
}

/** Nombre animé : `format` met en forme la valeur intermédiaire comme la finale (même nombre de décimales). */
export function AnimatedNumber({ value, format = (v) => Math.round(v).toLocaleString('fr-FR'), duree }: { value: number; format?: (v: number) => string; duree?: number }) {
  const v = useCountUp(value, duree);
  return (
    <span className="num" aria-label={format(value)}>
      <span aria-hidden>{format(v)}</span>
    </span>
  );
}
