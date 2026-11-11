/**
 * Les bâtiments de l'usine : un clic en sélectionne un (son contour passe au premier plan sur la carte), la corbeille
 * le retire. Chaque ligne dit sa surface, avec une barre qui la compare au plus grand. En bas, la surface totale,
 * comparée à celle que l'entreprise annonce quand on la connaît.
 *
 * Un bâtiment qui porte des zones ou des machines ne part pas sur un seul clic : la ligne dit d'abord ce qui partira
 * avec lui, et demande de confirmer. Une fois retiré, l'avis propose encore « Annuler ».
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Box, Trash2 } from 'lucide-react';
import type { Batiment } from '@/domain/types';
import { formatArea, formatNumber } from '@/geo/geodesy';
import { contenuBatiment, retirerBatiment, useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { ChiffresSecondaires, TitreCarte, TonGlyph, type ChiffreSecondaire } from '@/ui/explain';
import { measureBuilding } from '@/widgets/carte/measure';
import { verdictAnnonce } from '../lib/verdicts';

/** Au plus tant de noms dans la liste de ce qui partira ; au-delà, « et 3 autres ». */
const NOMS_MAX = 4;

/** Les premiers noms, puis « et 3 autres » : les numéros de machine restent en chasse fixe, la suite non. */
function Enumeration({ noms, mono }: { noms: string[]; mono?: boolean }) {
  const vus = noms.slice(0, NOMS_MAX).join(', ');
  const reste = noms.length - NOMS_MAX;
  return (
    <>
      {mono ? <span className="mono">{vus}</span> : vus}
      {reste > 0 && ` et ${reste} autre${reste > 1 ? 's' : ''}`}
    </>
  );
}

/** « Retirer Bâtiment B ? » avec ce qui part avec lui ; Échap ou « Garder » referment sans rien retirer. */
function ConfirmerRetrait({ b, fermer }: { b: Batiment; fermer: () => void }) {
  const toutesZones = useProject((s) => s.zones);
  const toutesMachines = useProject((s) => s.machines);
  // Calculé hors du sélecteur : un sélecteur qui rend un objet neuf à chaque appel relancerait le rendu sans fin.
  const contenu = useMemo(() => contenuBatiment({ zones: toutesZones, machines: toutesMachines }, b.id), [toutesZones, toutesMachines, b.id]);
  const garder = useRef<HTMLButtonElement>(null);
  useEffect(() => garder.current?.focus(), []);
  const { zones, machines } = contenu;
  return (
    <div
      className="loc-bat-confirmer"
      role="group"
      aria-labelledby={`loc-bat-confirmer-${b.id}`}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        fermer();
      }}
    >
      <p id={`loc-bat-confirmer-${b.id}`} className="loc-bat-confirmer-titre">
        Retirer {b.nom} de l’usine ?
      </p>
      <p>Partent avec lui :</p>
      <ul>
        {zones.length > 0 && (
          <li>
            <span className="num">{zones.length}</span> zone{zones.length > 1 ? 's' : ''} : <Enumeration noms={zones.map((z) => z.nom)} />
          </li>
        )}
        {machines.length > 0 && (
          <li>
            <span className="num">{machines.length}</span> machine{machines.length > 1 ? 's' : ''} : <Enumeration noms={machines.map((m) => m.numero || m.nom)} mono />
          </li>
        )}
      </ul>
      <div className="row wrap loc-bat-confirmer-actions">
        <button
          type="button"
          className="btn sm danger-soft"
          onClick={() => {
            fermer();
            retirerBatiment(b.id);
          }}
        >
          <Trash2 aria-hidden /> Retirer avec son contenu
        </button>
        <button ref={garder} type="button" className="btn sm ghost" onClick={fermer}>
          Garder
        </button>
      </div>
    </div>
  );
}

export function BatimentsCard({ selectedId, style }: { selectedId?: string; style?: CSSProperties }) {
  const batiments = useProject((s) => s.batiments);
  const zones = useProject((s) => s.zones);
  const machines = useProject((s) => s.machines);
  /** Bâtiment dont on demande la confirmation du retrait. */
  const [aConfirmer, setAConfirmer] = useState<string>();
  const corbeilles = useRef(new Map<string, HTMLButtonElement>());
  const annonce = useProject((s) => s.site?.surfaceAnnoncee);
  // Une mesure géodésique par bâtiment, recalculée seulement quand la liste change (pas à chaque mouvement de carte).
  const surfaces = useMemo(() => new Map(batiments.map((x) => [x.id, measureBuilding(x).area])), [batiments]);
  const total = useMemo(() => [...surfaces.values()].reduce((s, a) => s + a, 0), [surfaces]);
  const plusGrande = useMemo(() => Math.max(1, ...surfaces.values()), [surfaces]);
  const verdict = verdictAnnonce(total, annonce);
  // Le total et la surface annoncée côte à côte ; l'écart dans le « ? » quand il est normal, en clair quand il ne l'est pas.
  const chiffres: ChiffreSecondaire[] = [
    ...(batiments.length > 1 || annonce ? [{ label: 'Total au sol', valeur: formatNumber(Math.round(total)), unite: 'm²' }] : []),
    ...(annonce && verdict
      ? [
          {
            label: 'Annoncée',
            valeur: formatNumber(Math.round(annonce)),
            unite: 'm²',
            aide: verdict.ton === 'ok' ? `Surface déclarée par l’entreprise. ${verdict.texte}` : 'Surface déclarée par l’entreprise.',
            ton: verdict.ton,
          },
        ]
      : []),
  ];

  return (
    <section className="loc-batiments entree" style={style} data-guide="batiments" aria-labelledby="loc-batiments-titre">
      <TitreCarte
        id="loc-batiments-titre"
        titre="Bâtiments de l’usine"
        aide="Un autre bâtiment fait partie de l’usine ? Cliquez sur son toit : il s’ajoute ici. Chaque ligne donne sa surface au sol et sa hauteur."
      />
      <ul className="list loc-bat-liste">
        {batiments.map((x) => {
          const surface = surfaces.get(x.id) ?? 0;
          const occupe = zones.some((z) => z.batimentId === x.id) || machines.some((m) => m.batimentId === x.id);
          return (
            <li key={x.id} className="loc-bat">
              <button type="button" className="item" aria-pressed={x.id === selectedId} onClick={() => useUi.getState().selectBatiment(x.id)}>
                <Box size={16} aria-hidden />
                <span className="grow loc-bat-texte">
                  <span className="t truncate">{x.nom}</span>
                  <span className="loc-bat-barre" aria-hidden>
                    <i style={{ transform: `scaleX(${surface / plusGrande})` }} />
                  </span>
                </span>
                <span className="loc-bat-valeurs num">
                  <b>{formatArea(surface)}</b>
                  <small>{formatNumber(x.hauteur, 1)} m de haut</small>
                </span>
              </button>
              <button
                ref={(el) => {
                  if (el) corbeilles.current.set(x.id, el);
                  else corbeilles.current.delete(x.id);
                }}
                type="button"
                className="btn sm icon ghost loc-bat-suppr"
                aria-label={`Retirer ${x.nom} de l’usine`}
                aria-expanded={occupe ? aConfirmer === x.id : undefined}
                title="Retirer de l’usine"
                // Vide, il part tout de suite (l'avis propose « Annuler ») ; occupé, on dit d'abord ce qui part avec lui.
                onClick={() => (occupe ? setAConfirmer(aConfirmer === x.id ? undefined : x.id) : retirerBatiment(x.id))}
              >
                <Trash2 />
              </button>
              {aConfirmer === x.id && (
                <ConfirmerRetrait
                  b={x}
                  fermer={() => {
                    setAConfirmer(undefined);
                    corbeilles.current.get(x.id)?.focus();
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
      {chiffres.length > 0 && <ChiffresSecondaires items={chiffres} label="Surface de l’usine" className="loc-totaux" />}
      {verdict?.ton === 'warn' && (
        <p className="loc-annonce ton-warn">
          <TonGlyph ton="warn" />
          <span>{verdict.texte}</span>
        </p>
      )}
    </section>
  );
}
