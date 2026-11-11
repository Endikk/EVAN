/**
 * Outil de diagnostic d'un défaut répétitif : l'opérateur mesure l'écart entre deux défauts identiques sur la bande
 * (ou compte les étiquettes), EVAN cherche la pièce tournante dont le tour fait cette longueur.
 * Un petit schéma montre le principe (un cylindre abîmé qui marque la bande à chaque tour) ; l'explication en mots
 * s'ouvre sur la consigne elle-même. Chaque pièce trouvée tient en deux lignes ; un clic la désigne dans la 3D.
 * Rien n'est conclu avant que l'opérateur ait saisi sa mesure ; une saisie qui n'est pas un nombre le dit sous le champ.
 */
import { useEffect, useMemo, useState } from 'react';
import { Crosshair, Ruler } from 'lucide-react';
import type { Machine } from '@/domain/types';
import { MACHINE_TYPES, PAS_ETIQUETTE_M, type NatureDefaut } from '@/domain/catalog';
import { diagnostiquerPas, NATURE_DEFAUT_LIBELLE, TOLERANCE_PAS, type CandidatPas } from '@/analytics/repeatDefect';
import { fmtNombre } from '@/ui/format';
import { InfoTip } from '@/ui/InfoTip';
import { erreurNombre, lireNombre as parse } from './nombre';
import './RepeatDefectTool.css';

const NATURES: (NatureDefaut | '')[] = ['', 'impression', 'decoupe', 'marque', 'dorure'];
const NATURE_COURT: Record<NatureDefaut | '', string> = { '': 'Je ne sais pas', impression: 'Impression', decoupe: 'Découpe', marque: 'Marque', dorure: 'Dorure' };

/** Rapport entre l'écart mesuré et le tour de la pièce : court à l'écran, expliqué au survol. */
const RAPPORT_COURT: Record<CandidatPas['rapport'], string> = { 1: '', 2: '1 marque / 2 tours', 0.5: '2 marques / tour' };
const RAPPORT_LIBELLE: Record<CandidatPas['rapport'], string> = {
  1: 'une marque par tour',
  2: 'une marque tous les deux tours (défaut intermittent)',
  0.5: 'deux marques par tour (deux poses ou deux points abîmés)',
};

const CONFIANCE_MOT: Record<CandidatPas['confiance'], string> = { forte: 'Très probable', moyenne: 'Possible', faible: 'Peu probable' };

/** Centres des marques sur la bande au repos : à mi-tour (bande décalée d'un demi-écart), une marque passe sous le cylindre. */
const MARQUES = [-34, 30, 94, 158, 222, 286];
const ECART = 64;

/** Un cylindre abîmé tourne et marque la bande à chaque tour : les marques reviennent toujours au même écart. */
function SchemaPas({ id }: { id: string }) {
  return (
    <svg className="rd-schema" viewBox="0 0 240 84" role="img" aria-label="Un cylindre abîmé marque la bande à chaque tour : les marques reviennent toujours au même écart, égal au tour du cylindre.">
      <defs>
        <clipPath id={id}>
          <rect x="0" y="40" width="190" height="34" />
        </clipPath>
      </defs>
      <rect className="rd-bande-fond" x="0" y="46" width="240" height="12" rx="2" />
      <g clipPath={`url(#${id})`}>
        <g className="rd-defile">
          {MARQUES.map((c) => (
            <g key={c}>
              <rect className="rd-marque" x={c - 2.5} y="48" width="5" height="8" rx="1" />
              <path className="rd-cote" d={`M${c} 64v5M${c} 66.5h${ECART}`} />
            </g>
          ))}
        </g>
      </g>
      <g className="rd-cylindre">
        <circle cx="190" cy="26" r="18" />
        <circle className="rd-defaut" cx="190" cy="9.5" r="3.4" />
      </g>
      <text x="96" y="81" textAnchor="middle">
        toujours le même écart : un tour du cylindre
      </text>
    </svg>
  );
}

/** Le schéma, et une ligne : ce qu'il faut mesurer. Le pourquoi s'ouvre sur cette ligne (pas de « ? » de plus). */
function Explication({ id, numero, pieces }: { id: string; numero: string; pieces: number }) {
  return (
    <div className="rd-intro">
      <SchemaPas id={id} />
      <p className="rd-comment">
        <InfoTip texte="Mesurez l’écart entre deux marques sur la bande" label="Comprendre : défaut répétitif">
          <p>Une pièce qui tourne (rouleau, cylindre, anilox), abîmée ou sale, marque la bande à chaque tour : la marque revient toujours au même écart.</p>
          <p>
            EVAN connaît {pieces} pièces qui tournent sur {numero} et cherche celle dont le tour fait cet écart.
          </p>
        </InfoTip>
      </p>
    </div>
  );
}

export function RepeatDefectTool({ machine, onLocate, compact }: { machine: Machine; onLocate?(organeNumero: number): void; compact?: boolean }) {
  const type = MACHINE_TYPES[machine.type];
  const [mode, setMode] = useState<'mm' | 'etiquettes'>('mm');
  const [pasMm, setPasMm] = useState('');
  const [n, setN] = useState('');
  const [pasEtiquette, setPasEtiquette] = useState(String(Math.round(PAS_ETIQUETTE_M * 1000)));
  const [nature, setNature] = useState<NatureDefaut | ''>('');

  // Visite guidée : saisie d'un pas et d'un aspect de défaut, comme le ferait l'opérateur.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ machineId?: string; pas?: string; nature?: NatureDefaut | '' }>).detail;
      if (d.machineId && d.machineId !== machine.id) return;
      setMode('mm');
      if (d.pas !== undefined) setPasMm(d.pas);
      if (d.nature !== undefined) setNature(d.nature);
    };
    window.addEventListener('evan:pitch-demo', h);
    return () => window.removeEventListener('evan:pitch-demo', h);
  }, [machine.id]);

  const pas = mode === 'mm' ? parse(pasMm) : parse(n) * parse(pasEtiquette);
  // Une saisie qui n'est pas un nombre positif se signale au lieu de laisser la liste vide sans explication.
  const erreurMm = mode === 'mm' ? erreurNombre(pasMm) : undefined;
  const erreurN = mode === 'etiquettes' ? erreurNombre(n) : undefined;
  const erreurLongueur = mode === 'etiquettes' ? erreurNombre(pasEtiquette) : undefined;
  const erreurIds = `rd-erreur-${machine.id}-${compact ? 'c' : 'p'}`;
  const diag = useMemo(
    () => (type && pas > 0 ? diagnostiquerPas(type.organes, pas, { nature: nature || undefined }) : null),
    [type, pas, nature],
  );
  const pieces = type?.organes.reduce((s, o) => s + o.cylindres.length, 0) ?? 0;

  if (!type || !pieces) {
    return (
      <p className="rd-hors-bande">
        {machine.numero} ne travaille pas en bande continue : un défaut n’y revient pas au tour d’un cylindre.
      </p>
    );
  }

  return (
    <div className="pitch">
      <Explication id={`rd-pas-${machine.id}-${compact ? 'c' : 'p'}`} numero={machine.numero} pieces={pieces} />
      <div className="pitch-inputs">
        <div className="seg" role="group" aria-label="Comment mesurer l’écart">
          <button aria-pressed={mode === 'mm'} onClick={() => setMode('mm')}>
            <Ruler /> En mm
          </button>
          <button aria-pressed={mode === 'etiquettes'} onClick={() => setMode('etiquettes')}>
            En étiquettes
          </button>
        </div>
        {mode === 'mm' ? (
          <label className="field pitch-field">
            <span>Écart entre deux marques</span>
            <span className="input-unit">
              <input
                className="input num"
                inputMode="decimal"
                placeholder="ex. 339,5"
                value={pasMm}
                onChange={(e) => setPasMm(e.target.value)}
                aria-label="Écart entre deux marques, en millimètres"
                aria-invalid={!!erreurMm}
                aria-describedby={erreurMm ? `${erreurIds}-mm` : undefined}
              />
              <i>mm</i>
            </span>
            {erreurMm && (
              <span className="rd-erreur" id={`${erreurIds}-mm`}>
                {erreurMm}
              </span>
            )}
          </label>
        ) : (
          <div className="row pitch-labels">
            <label className="field">
              <span>Une marque toutes les</span>
              <input
                className="input num"
                inputMode="numeric"
                placeholder="ex. 3"
                value={n}
                onChange={(e) => setN(e.target.value)}
                aria-label="Nombre d’étiquettes entre deux marques"
                aria-invalid={!!erreurN}
                aria-describedby={erreurN ? `${erreurIds}-n` : undefined}
              />
              {erreurN && (
                <span className="rd-erreur" id={`${erreurIds}-n`}>
                  {erreurN}
                </span>
              )}
            </label>
            <label className="field">
              <span>étiquettes, d’une longueur de</span>
              <span className="input-unit">
                <input
                  className="input num"
                  inputMode="decimal"
                  value={pasEtiquette}
                  onChange={(e) => setPasEtiquette(e.target.value)}
                  aria-label="Longueur d’une étiquette en millimètres"
                  aria-invalid={!!erreurLongueur}
                  aria-describedby={erreurLongueur ? `${erreurIds}-l` : undefined}
                />
                <i>mm</i>
              </span>
              {erreurLongueur && (
                <span className="rd-erreur" id={`${erreurIds}-l`}>
                  {erreurLongueur}
                </span>
              )}
            </label>
          </div>
        )}
      </div>
      <div className="rd-nature">
        {/* Un libellé de champ : il ouvre lui-même son explication. */}
        <span className="rd-nature-tete" id={`rd-nature-${machine.id}`}>
          <InfoTip texte="À quoi ressemble le défaut ?" label="Comprendre : l’aspect du défaut">
            <p>Quand plusieurs pièces ont le même tour, l’aspect du défaut les départage.</p>
          </InfoTip>
        </span>
        <div className="pitch-nature" role="group" aria-labelledby={`rd-nature-${machine.id}`}>
          {NATURES.map((k) => (
            <button key={k || 'tous'} className={`chip-btn ${nature === k ? 'on' : ''}`} aria-pressed={nature === k} onClick={() => setNature(k)} title={k ? NATURE_DEFAUT_LIBELLE[k] : 'Aspect du défaut inconnu : toutes les pièces sont comparées'}>
              {NATURE_COURT[k]}
            </button>
          ))}
        </div>
      </div>

      {diag && (
        <div className="pitch-results" aria-live="polite">
          {mode === 'etiquettes' && diag.candidats.length > 0 && (
            <p className="rd-resultat">
              Écart : <b className="num">{fmtNombre(pas, 1)} mm</b>
            </p>
          )}
          {diag.candidats.slice(0, compact ? 4 : 6).map((c, i) => (
            <button key={`${c.cylindre}-${c.rapport}`} className={`pitch-cand ${i === 0 ? 'best' : ''}`} onClick={() => onLocate?.(c.organeNumero)} disabled={!onLocate}>
              <span className={`pitch-rank conf-${c.confiance}`}>{i + 1}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <b className="truncate" style={{ display: 'block' }}>
                  {c.cylindre}
                </b>
                <span className="s">
                  {c.organeNumero}. {c.organeNom} · <span className="num">{fmtNombre(c.circonference, 1)} mm</span>
                  {c.rapport !== 1 && <span title={RAPPORT_LIBELLE[c.rapport]}> · {RAPPORT_COURT[c.rapport]}</span>}
                </span>
                {c.memeDeveloppement.length > 0 && <span className="s pitch-same">Même tour que {c.memeDeveloppement.join(', ')}</span>}
              </span>
              <span className="pitch-gap">
                <span className="chip">{CONFIANCE_MOT[c.confiance]}</span>
                <span className="faint num" title="Écart entre votre mesure et le tour de cette pièce">
                  {c.ecartMm >= 0 ? '+' : ''}
                  {fmtNombre(c.ecartMm, 1)} mm
                </span>
              </span>
              {onLocate && <Crosshair className="pitch-locate" aria-hidden />}
            </button>
          ))}
          {!diag.candidats.length && (
            <div className="empty rd-aucune">
              <b>Aucune pièce qui tourne n’a ce tour (à {fmtNombre(TOLERANCE_PAS * 100, 1)} % près)</b>
              <span>Cherchez ailleurs : matière, cliché ou plaque abîmés, ou machine en amont.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
