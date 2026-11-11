/**
 * Petites animations qui expliquent un changement : un nombre qui rejoint sa nouvelle valeur montre qu'il a bougé.
 * Au premier affichage, la valeur est là tout de suite : un compteur qui partait de 0 montrait pendant 700 ms des
 * valeurs fausses (« 0 tâche en retard ») qu'on avait le temps de lire. Animations réduites : jamais d'animation.
 */
import { useEffect, useRef, useState } from 'react';
import { isReducedMotion } from '@/store/ui';

const DUREE_MS = 700;

const sortie = (t: number) => 1 - Math.pow(1 - t, 3);

/** Valeur affichée : `cible` dès le premier affichage, puis elle rejoint chaque nouvelle cible en `duree` ms. */
export function useCountUp(cible: number, duree = DUREE_MS): number {
  const [affiche, setAffiche] = useState(cible);
  const depart = useRef(cible);

  useEffect(() => {
    if (!Number.isFinite(cible) || !Number.isFinite(depart.current) || isReducedMotion()) {
      depart.current = cible;
      return setAffiche(cible);
    }
    const de = depart.current;
    if (de === cible) return;
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
