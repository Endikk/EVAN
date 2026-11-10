/**
 * La bibliothèque des machines du kit, rangée par métier. Chaque carte montre la machine (vue de dessus, nom,
 * encombrement) ; ce qu'elle fait est dans son « ? ». On la glisse sur le plan, ou, au doigt, on la touche puis on
 * touche l'endroit du plan.
 */
import { useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { FileUp, PlayCircle, X } from 'lucide-react';
import { useProject } from '@/store/project';
import { useUi } from '@/store/ui';
import { MACHINE_TYPES, MODEL_FOOTPRINT } from '@/domain/catalog';
import { useSceneUi } from '@/widgets/scene/sceneState';
import { DND_TYPE } from '@/widgets/scene/placement';
import { InfoTip } from '@/ui/InfoTip';
import { emprise, famillesBibliotheque, phraseMetier } from '../lib/metier';
import { GesteDepot, PAS_GRILLE_CM } from './GesteDepot';

const FAMILLES = famillesBibliotheque();

/** Écran tactile : la légende du geste dit « touchez » au lieu de « glissez ». */
const TACTILE = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)')?.matches ?? false);

/** Vue de dessus d'un modèle, à ses proportions : une silhouette, et ses cylindres. */
export function SilhouetteMachine({ type, largeur = 64 }: { type: string; largeur?: number }) {
  const fp = MODEL_FOOTPRINT[type] ?? MODEL_FOOTPRINT.custom;
  const w = fp.max[0] - fp.min[0];
  const d = fp.max[1] - fp.min[1];
  const s = 70 / Math.max(w, 4);
  const n = Math.max(1, Math.round(w / 1.4));
  return (
    <svg className="mc-silhouette" width={largeur} height={largeur * 0.55} viewBox="-40 -22 80 44" aria-hidden="true">
      <rect x={-(w * s) / 2} y={-(d * s) / 2} width={w * s} height={d * s} rx={3} />
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={-(w * s) / 2 + ((i + 0.5) * w * s) / n} cy={0} r={Math.min(4, (d * s) / 5)} />
      ))}
    </svg>
  );
}

function demarrerGlisser(e: DragEvent, valeur: string) {
  e.dataTransfer.setData(DND_TYPE, valeur);
  e.dataTransfer.setData('text/plain', valeur);
  e.dataTransfer.effectAllowed = 'copy';
  useSceneUi.getState().set({ dragType: valeur });
}

const finirGlisser = () => useSceneUi.getState().set({ ghost: undefined, dragType: undefined });

/** Nom affiché d'un type en cours de pose (« Presse flexo », ou le nom du fichier importé). */
function nomEnPose(placingType: string): string {
  if (placingType.startsWith('custom:')) return placingType.split('|')[1] ?? 'le modèle importé';
  return MACHINE_TYPES[placingType]?.libelle ?? placingType;
}

interface CarteProps {
  vignette: ReactNode;
  nom: string;
  /** Encombrement au sol, à droite du nom. */
  mesure?: string;
  /** Ce que fait la machine : dans le « ? ». */
  aide: ReactNode;
  actif?: boolean;
  /** Valeur transportée par le glisser-déposer ; sans elle, la carte ne se glisse pas. */
  glisser?: string;
  activer: () => void;
  className?: string;
}

/**
 * Une carte de la bibliothèque. C'est un élément qui se comporte en bouton (et non un bouton), pour que son « ? »
 * n'y soit pas imbriqué ; le clic sur le « ? » n'active pas la carte.
 */
function CarteBiblio({ vignette, nom, mesure, aide, actif, glisser, activer, className = '' }: CarteProps) {
  const auClavier = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    activer();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      className={`mc-lib-item ${actif ? 'actif' : ''} ${className}`}
      aria-pressed={glisser ? !!actif : undefined}
      draggable={!!glisser}
      onDragStart={glisser ? (e) => demarrerGlisser(e, glisser) : undefined}
      onDragEnd={glisser ? finirGlisser : undefined}
      onClick={activer}
      onKeyDown={auClavier}
    >
      <span className="mc-lib-vignette">{vignette}</span>
      <span className="mc-lib-nom">
        <b className="truncate">{nom}</b>
        <InfoTip label={`Comprendre : ${nom}`}>{aide}</InfoTip>
        {mesure && <small className="num">{mesure}</small>}
      </span>
    </div>
  );
}

function Geste({ debutant, fermer }: { debutant: boolean; fermer: () => void }) {
  return (
    <figure className="mc-geste" data-guide="machines-geste">
      <GesteDepot boucles={debutant ? 6 : 2} />
      <figcaption>
        {TACTILE ? 'Touchez une carte, puis l’endroit du plan.' : 'Glissez une carte sur le plan, là où se trouve la machine.'}
        <InfoTip label="Le geste en détail">
          <p>La machine s’aligne d’elle-même sur une grille de {PAS_GRILLE_CM} cm.</p>
          <p>{TACTILE ? 'À la souris : glissez la carte sur le plan.' : 'Sur tablette : touchez la carte, puis l’endroit du plan.'}</p>
        </InfoTip>
      </figcaption>
      {!debutant && (
        <button type="button" className="btn sm ghost icon mc-geste-fermer" onClick={fermer} aria-label="Masquer l’animation du geste">
          <X />
        </button>
      )}
    </figure>
  );
}

export function Bibliotheque({ debutant }: { debutant: boolean }) {
  const imports = useProject((s) => s.modelesImportes);
  const placingType = useUi((s) => s.placingType);
  const [geste, setGeste] = useState(false);
  const fichier = useRef<HTMLInputElement>(null);
  const choisir = (valeur: string) => useUi.getState().setPlacingType(placingType === valeur ? undefined : valeur);

  return (
    <section className="mc-biblio" aria-labelledby="mc-biblio-titre" data-guide="machines-bibliotheque">
      <div className="mc-biblio-tete">
        <h3 id="mc-biblio-titre" className="section-title">
          Bibliothèque des machines
          <InfoTip label="Comprendre : la bibliothèque">
            <p>Les machines du kit imprimerie, rangées par métier. Chacune arrive avec ses organes déjà décrits, du dérouleur au rembobineur.</p>
          </InfoTip>
        </h3>
        {!debutant && !geste && (
          <button type="button" className="btn sm ghost" onClick={() => setGeste(true)} data-guide="machines-geste">
            <PlayCircle /> Revoir le geste
          </button>
        )}
      </div>

      {(debutant || geste) && <Geste debutant={debutant} fermer={() => setGeste(false)} />}

      {placingType && (
        <p className="mc-pose-en-cours" role="status">
          <span>
            Touchez l’endroit du plan où poser <b>{nomEnPose(placingType)}</b>.
          </span>
          <button type="button" className="btn sm ghost icon" onClick={() => useUi.getState().setPlacingType(undefined)} aria-label="Annuler la pose">
            <X />
          </button>
        </p>
      )}

      {FAMILLES.map((f) => (
        <div key={f.titre} className="mc-famille">
          <h4>{f.titre}</h4>
          <ul className="mc-lib">
            {f.types.map((t) => {
              const def = MACHINE_TYPES[t];
              return (
                <li key={t}>
                  <CarteBiblio
                    vignette={<SilhouetteMachine type={t} />}
                    nom={def.libelle}
                    mesure={emprise(t)}
                    aide={
                      <>
                        <p>{phraseMetier(t)}</p>
                        <p>
                          Modèle du kit : {def.nomKit}, {def.organes.length} organes déjà décrits.
                        </p>
                      </>
                    }
                    actif={placingType === t}
                    glisser={t}
                    activer={() => choisir(t)}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="mc-famille">
        <h4>Votre propre machine</h4>
        <ul className="mc-lib">
          {imports.map((im) => {
            const valeur = `custom:${im.url}|${im.nom}`;
            return (
              <li key={im.url}>
                <CarteBiblio
                  vignette={<SilhouetteMachine type="custom" />}
                  nom={im.nom}
                  aide={<p>Modèle importé. Ses organes se décrivent à l’étape suivante.</p>}
                  actif={placingType === valeur}
                  glisser={valeur}
                  activer={() => choisir(valeur)}
                />
              </li>
            );
          })}
          <li>
            <CarteBiblio
              className="mc-lib-import"
              vignette={<FileUp aria-hidden />}
              nom="Importer un modèle 3D"
              aide={<p>Une machine hors du kit, au format glTF (.glb ou .gltf), cotée en mètres.</p>}
              activer={() => fichier.current?.click()}
            />
          </li>
        </ul>
        <input
          ref={fichier}
          type="file"
          accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            useProject.getState().addModeleImporte({ url: URL.createObjectURL(f), nom: f.name.replace(/\.(glb|gltf)$/i, '') });
            e.target.value = '';
          }}
        />
      </div>
    </section>
  );
}
