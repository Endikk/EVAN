/**
 * Sélecteur du motif de fond, pour comparer les motifs du nuage sur la page elle-même, en mouvement : il apparaît dès
 * que l'adresse porte ?fond=… (http://localhost:8088/?fond=trame sous Docker). Sur un écran étroit, il se réduit au
 * motif courant entre deux flèches. À retirer une fois le motif choisi (et `?fond=` avec lui).
 */
import { useEffect } from 'react';
import type { PixelMotif } from '@/ui/PixelField';

export const CHOIX_FOND: readonly { motif: PixelMotif; nom: string; detail: string }[] = [
  { motif: 'pixels', nom: 'Pixels', detail: 'Les carrés tramés de la marque, aujourd’hui partout dans l’application.' },
  { motif: 'trame', nom: 'Trame à points', detail: 'La demi-teinte d’une impression flexo : des points à 45°, plus gros là où c’est dense.' },
  { motif: 'lignes', nom: 'Trame en lignes', detail: 'Des traits parallèles qui s’épaississent avec la densité, comme une gravure.' },
  { motif: 'rosette', nom: 'Rosette', detail: 'Deux encres en points, à 15° et 75°, superposées comme sur une épreuve couleur.' },
  { motif: 'stochastique', nom: 'Stochastique', detail: 'La trame aléatoire des presses récentes : des points fins semés au hasard.' },
  { motif: 'ondes', nom: 'Ondes', detail: 'Des lignes fines qui suivent la vague, s’écartent et se resserrent avec elle.' },
  { motif: 'vagues', nom: 'Vagues pleines', detail: 'La vague en plis doux, sans trame.' },
  { motif: 'anilox', nom: 'Anilox', detail: 'Les alvéoles hexagonales du rouleau qui dose l’encre d’un groupe flexo.' },
  { motif: 'croix', nom: 'Croix de repérage', detail: 'Les croix qui servent à caler les couleurs, plus grandes au cœur de la vague.' },
  { motif: 'codebarres', nom: 'Code-barres', detail: 'Des barres de largeurs variées, celles des étiquettes, découpées par la vague.' },
  { motif: 'spires', nom: 'Spires de bobine', detail: 'Les spires d’un rouleau vu de côté, allumées là où passe la vague.' },
  { motif: 'etiquettes', nom: 'Étiquettes', detail: 'Des étiquettes sur leur support : contour au bord de la vague, pleines au cœur.' },
  { motif: 'moire', nom: 'Moiré', detail: 'Deux trames presque parallèles : leur superposition fait naître des franges qui dérivent.' },
];

interface Props {
  valeur: PixelMotif;
  onChange(m: PixelMotif): void;
}

export function ChoixFond({ valeur, onChange }: Props) {
  const choix = CHOIX_FOND.find((c) => c.motif === valeur);
  // Flèches gauche et droite : le motif précédent ou suivant, sans quitter la presse des yeux. 1 à 9 : un motif direct.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const i = CHOIX_FOND.findIndex((c) => c.motif === valeur);
      const n = CHOIX_FOND.length;
      const cible =
        e.key === 'ArrowRight' ? CHOIX_FOND[(i + 1) % n] : e.key === 'ArrowLeft' ? CHOIX_FOND[(i + n - 1) % n] : /^[1-9]$/.test(e.key) ? CHOIX_FOND[Number(e.key) - 1] : undefined;
      if (cible) onChange(cible.motif);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onChange, valeur]);
  const i = CHOIX_FOND.findIndex((c) => c.motif === valeur);
  const n = CHOIX_FOND.length;
  return (
    <div className="lp-choix" role="group" aria-label="Motif du fond (comparaison)">
      <div className="lp-choix-court">
        <button type="button" aria-label="Motif précédent" onClick={() => onChange(CHOIX_FOND[(i + n - 1) % n].motif)}>
          ‹
        </button>
        <span>
          {i + 1}. {choix?.nom}
        </span>
        <button type="button" aria-label="Motif suivant" onClick={() => onChange(CHOIX_FOND[(i + 1) % n].motif)}>
          ›
        </button>
      </div>
      <div className="lp-choix-liste">
        {CHOIX_FOND.map((c, i) => (
          <button key={c.motif} type="button" className={c.motif === valeur ? 'on' : ''} aria-pressed={c.motif === valeur} onClick={() => onChange(c.motif)}>
            <span>{i + 1}</span>
            {c.nom}
          </button>
        ))}
      </div>
      {choix && <p>{choix.detail}</p>}
    </div>
  );
}
