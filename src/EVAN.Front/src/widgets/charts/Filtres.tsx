/**
 * Ce que regarde un écran d'analyse (historique, énergie) : la période et la machine. Deux choix, nommés en clair, au
 * même endroit et avec les mêmes mots sur les deux écrans, qui pilotent tout l'écran. Les filtres propres à un bloc
 * (gravité du journal…) vivent dans ce bloc.
 *
 * Quand une machine est choisie et que la barre est sortie de la vue, une pastille reste collée en haut de l'écran
 * (« Filtré sur R02 · Revoir toutes les machines ») : un clic sur une barre filtre tout l'écran, et sans elle on
 * l'oublierait trois blocs plus bas.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, Factory, Filter, X } from 'lucide-react';
import type { Machine } from '@/domain/types';
import { Select } from '@/ui/Select';

export type Periode = '24h' | '7j';

interface Props {
  periode: Periode;
  onPeriode(p: Periode): void;
  machineId: string;
  onMachine(id: string): void;
  machines: Machine[];
  rang: number;
  /** Lien vers le même regard sur un autre écran (« Voir son énergie »), quand une machine est choisie. */
  lien?: ReactNode;
}

/** Le premier ancêtre qui défile : la pastille ne paraît que lorsque la barre en est sortie. */
function parentDefilant(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/** Vrai quand l'élément est sorti par le haut de la zone qui défile. */
function useSortiParLeHaut(actif: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [sorti, setSorti] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !actif) {
      setSorti(false);
      return;
    }
    const obs = new IntersectionObserver(([e]) => setSorti(!e.isIntersecting && e.boundingClientRect.top < (e.rootBounds?.top ?? 0)), {
      root: parentDefilant(el),
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [actif]);
  return [ref, sorti] as const;
}

export function Filtres({ periode, onPeriode, machineId, onMachine, machines, rang, lien }: Props) {
  const choisie = machines.find((m) => m.id === machineId);
  const [barre, sortie] = useSortiParLeHaut(!!choisie);
  return (
    <>
      <div className="entree" style={{ '--i': rang } as CSSProperties}>
        <div ref={barre} className="hist-filtres" role="group" aria-label="Ce que montre l’écran" data-guide="filtres">
          <div className="hf-groupe">
            <span className="hf-label" id="hf-periode">
              <CalendarDays aria-hidden /> Période
            </span>
            <div className="seg" role="group" aria-labelledby="hf-periode">
              <button type="button" aria-pressed={periode === '24h'} onClick={() => onPeriode('24h')}>
                24 heures
              </button>
              <button type="button" aria-pressed={periode === '7j'} onClick={() => onPeriode('7j')}>
                7 jours
              </button>
            </div>
          </div>
          <div className="hf-groupe hf-machine">
            <label className="hf-label" htmlFor="hf-machine">
              <Factory aria-hidden /> Machine
            </label>
            <Select
              id="hf-machine"
              value={machineId}
              onChange={onMachine}
              options={[{ value: '', label: 'Toutes les machines' }, ...machines.map((m) => ({ value: m.id, label: `${m.numero} · ${m.nom}` }))]}
            />
            {choisie && (
              <button type="button" className="btn sm ghost hf-retirer" onClick={() => onMachine('')}>
                <X aria-hidden /> Revoir toutes les machines
              </button>
            )}
            {choisie && lien}
          </div>
        </div>
      </div>
      {/* Hauteur nulle : la pastille colle en haut sans pousser le contenu quand elle paraît. */}
      <div className="filtre-colle" hidden={!choisie || !sortie}>
        {choisie && (
          <p className="filtre-colle-pastille">
            <Filter aria-hidden />
            <span>
              Filtré sur <b>{choisie.numero}</b>
            </span>
            <button type="button" className="btn sm ghost" onClick={() => onMachine('')}>
              Revoir toutes les machines
            </button>
          </p>
        )}
      </div>
    </>
  );
}
