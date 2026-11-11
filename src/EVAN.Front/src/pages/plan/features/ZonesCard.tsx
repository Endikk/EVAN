/**
 * Les zones de l'atelier : un bouton par type (sa couleur et son nom ; ce qu'il désigne dans le « ? » du titre), le
 * geste pour tracer pendant qu'un type est choisi, puis la liste des zones dessinées. Une zone qui vient d'être tracée
 * s'éclaire une fois dans la liste : on voit qu'elle est arrivée. Dans une usine à étages, la liste est celle du niveau
 * affiché, et une zone sélectionnée peut changer de niveau.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { TypeZone } from '@/domain/types';
import { borneNiveaux, niveauDe, nomNiveau } from '@/domain/niveaux';
import { formatArea, signedArea } from '@/geo/geodesy';
import { retirerZone, useProject } from '@/store/project';
import { useNiveauActif, useNiveauxUsine } from '@/store/niveau';
import { isReducedMotion, useUi } from '@/store/ui';
import { TitreCarte } from '@/ui/explain';
import { InfoTip } from '@/ui/InfoTip';
import { Select } from '@/ui/Select';
import { ZONE_COULEUR, ZONE_LIBELLE } from '@/widgets/scene/Zones3D';
import { switchView } from '@/widgets/scene/planView';
import { ORDRE_ZONES, ZONE_COURT, ZONE_SENS } from '../lib/typesZone';
import { GesteZone } from './gestes';

/** Les types proposés pour une zone déjà tracée. */
const CHOIX_TYPES = ORDRE_ZONES.map((t) => ({ value: t, label: ZONE_LIBELLE[t] }));

/** Durée de l'éclairage d'une zone nouvelle dans la liste (le temps de l'animation CSS). */
const FLASH_MS = 1400;

function commencer(t: TypeZone) {
  void switchView('2d');
  useUi.getState().selectZone(undefined);
  useUi.getState().setZoneTool(t);
}

/**
 * Fait venir un bloc dans le panneau s'il est caché par le défilement (sans bouger s'il est déjà visible). Sur
 * téléphone, le panneau ne défile pas seul (c'est la page) : on ne bouge rien, pour ne pas faire sortir le plan.
 */
function amenerEnVue(el: Element | null | undefined) {
  const corps = el?.closest('.panel-body');
  if (!el || !corps || getComputedStyle(corps).overflowY === 'visible') return;
  el.scrollIntoView({ block: 'nearest', behavior: isReducedMotion() ? 'auto' : 'smooth' });
}

/**
 * Zones apparues depuis le rendu précédent, gardées le temps de leur éclairage. La nouvelle zone est amenée en vue
 * dans le panneau : on la voit arriver, avec ses champs pour la renommer.
 */
function useZonesNouvelles(ids: string[], liste: RefObject<HTMLUListElement | null>): Set<string> {
  const connues = useRef(new Set(ids));
  const [neuves, setNeuves] = useState<Set<string>>(new Set());
  useEffect(() => {
    const ajout = ids.filter((id) => !connues.current.has(id));
    connues.current = new Set(ids);
    if (!ajout.length) return;
    setNeuves(new Set(ajout));
    window.requestAnimationFrame(() => amenerEnVue(liste.current?.querySelector(`[data-zone="${CSS.escape(ajout[0])}"]`)));
    const t = window.setTimeout(() => setNeuves(new Set()), FLASH_MS);
    return () => window.clearTimeout(t);
  }, [ids, liste]);
  return neuves;
}

export function ZonesCard({ style }: { style?: CSSProperties }) {
  const toutes = useProject((s) => s.zones);
  const batiments = useProject((s) => s.batiments);
  const etages = useNiveauxUsine() > 1;
  const niveau = useNiveauActif();
  const zones = useMemo(() => (etages ? toutes.filter((z) => niveauDe(z) === niveau) : toutes), [toutes, etages, niveau]);
  const ailleurs = toutes.length - zones.length;
  const selectedZoneId = useUi((s) => s.selectedZoneId);
  const outil = useUi((s) => s.zoneTool);
  const ids = useMemo(() => zones.map((z) => z.id), [zones]);
  const surfaces = useMemo(() => new Map(zones.map((z) => [z.id, Math.abs(signedArea(z.polygone))])), [zones]);
  const plusGrande = useMemo(() => Math.max(1, ...surfaces.values()), [surfaces]);
  const liste = useRef<HTMLUListElement>(null);
  const geste = useRef<HTMLDivElement>(null);
  const neuves = useZonesNouvelles(ids, liste);
  const niveauxDe = (batimentId: string) => borneNiveaux(batiments.find((b) => b.id === batimentId)?.niveaux ?? 1);

  // Un type choisi : le geste à faire vient en vue dans le panneau.
  useEffect(() => {
    if (outil) amenerEnVue(geste.current);
  }, [outil]);

  return (
    <section className="pln-zones entree" style={style} data-guide="zones" aria-labelledby="pln-zones-titre">
      <TitreCarte
        id="pln-zones-titre"
        titre="Zones de l’atelier"
        terme="zone"
        aide={ORDRE_ZONES.map((t) => `${ZONE_LIBELLE[t]} : ${ZONE_COURT[t].toLowerCase()}.`).join(' ')}
        actions={etages ? <span className="chip">{nomNiveau(niveau)}</span> : undefined}
      />

      <div className="pln-types" role="group" aria-label="Ajouter une zone : choisissez son type">
        {ORDRE_ZONES.map((t) => (
          <button
            key={t}
            type="button"
            className="pln-type"
            style={{ ['--pln-c' as string]: ZONE_COULEUR[t] }}
            aria-pressed={outil === t}
            title={ZONE_SENS[t]}
            onClick={() => (outil === t ? useUi.getState().setZoneTool(null) : commencer(t))}
          >
            {/* Pas de pastille de couleur : les zones sont toutes du même gris, et un carré gris se lisait comme une case à cocher. */}
            <span className="pln-type-texte">
              <Plus aria-hidden /> {ZONE_LIBELLE[t]}
            </span>
          </button>
        ))}
      </div>

      {outil && (
        <div ref={geste} className="pln-geste-carte" role="status" key={outil}>
          <GesteZone couleur={ZONE_COULEUR[outil]} />
          <div>
            <b>
              <InfoTip label="Comment tracer une zone" texte={`Tracez la zone « ${ZONE_LIBELLE[outil]} » sur le plan`}>
                <p>Appuyez à un coin, glissez jusqu’au coin opposé, relâchez. Le rectangle s’aimante au mètre près.</p>
              </InfoTip>
            </b>
            <button type="button" className="btn sm ghost" onClick={() => useUi.getState().setZoneTool(null)}>
              <X /> Annuler
            </button>
          </div>
        </div>
      )}

      <ul ref={liste} className="list pln-liste" data-guide="zones-liste" aria-label="Zones dessinées">
        {zones.map((z) => {
          const choisie = z.id === selectedZoneId;
          return (
            <li key={z.id} data-zone={z.id} className={`pln-zone ${neuves.has(z.id) ? 'neuve' : ''}`} style={{ ['--pln-c' as string]: ZONE_COULEUR[z.type] }}>
              <div className="pln-zone-ligne">
                <button type="button" className="item" aria-pressed={choisie} onClick={() => useUi.getState().selectZone(choisie ? undefined : z.id)}>
                  <span className="grow pln-zone-texte">
                    <span className="t truncate">
                      {z.nom}
                      {/* Le type n'est redit que si le nom ne le dit pas déjà (« Atelier impression » le dit). */}
                      {!z.nom.toLowerCase().includes(ZONE_LIBELLE[z.type].toLowerCase()) && <span className="pln-zone-type"> · {ZONE_LIBELLE[z.type]}</span>}
                    </span>
                    <span className="pln-zone-barre" aria-hidden>
                      <i style={{ transform: `scaleX(${(surfaces.get(z.id) ?? 0) / plusGrande})` }} />
                    </span>
                  </span>
                  <span className="num pln-zone-surface">{formatArea(surfaces.get(z.id) ?? 0)}</span>
                </button>
                <button
                  type="button"
                  className="btn sm icon ghost pln-suppr"
                  aria-label={`Retirer la zone ${z.nom}`}
                  title="Retirer la zone (ses machines restent en place)"
                  onClick={() => {
                    if (choisie) useUi.getState().selectZone(undefined);
                    retirerZone(z.id);
                  }}
                >
                  <Trash2 />
                </button>
              </div>
              {choisie && (
                <div className="pln-zone-edition">
                  <label className="field">
                    <span>Nom</span>
                    <input className="input" value={z.nom} onChange={(e) => useProject.getState().updateZone(z.id, { nom: e.target.value })} />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <Select value={z.type} onChange={(v) => useProject.getState().updateZone(z.id, { type: v as TypeZone })} options={CHOIX_TYPES} />
                  </label>
                  {niveauxDe(z.batimentId) > 1 && (
                    <label className="field pln-zone-niveau">
                      <span>Niveau</span>
                      <Select
                        value={String(niveauDe(z))}
                        onChange={(v) => {
                          // La zone part avec ses machines ; la scène la suit à son nouveau niveau.
                          useProject.getState().updateZone(z.id, { niveau: Number(v) });
                          useUi.getState().setNiveau(Number(v));
                        }}
                        options={Array.from({ length: niveauxDe(z.batimentId) }, (_, n) => ({ value: String(n), label: nomNiveau(n) }))}
                      />
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
        {!zones.length && <li className="pln-vide">{etages ? `Pas encore de zone à ce niveau (${nomNiveau(niveau).toLowerCase()}).` : 'Pas encore de zone.'}</li>}
      </ul>
      {ailleurs > 0 && (
        <p className="pln-autres-niveaux">
          {ailleurs} autre{ailleurs > 1 ? 's' : ''} zone{ailleurs > 1 ? 's' : ''} sur les autres niveaux.
        </p>
      )}
    </section>
  );
}
