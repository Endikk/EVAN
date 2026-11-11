/**
 * « Revoir la panne » : la panne rejouée en accéléré, comme la lecture d'un historien industriel, et racontée en trois
 * temps. Avant : la mesure dérive puis franchit le seuil d'attention. La panne : l'alarme arrête la machine,
 * quelqu'un la prend en charge. Après : la réparation, le redémarrage, la production qui reprend. La machine en 3D
 * ralentit et s'arrête, l'organe en cause s'allume, la courbe de la mesure franchit ses seuils, chaque étape
 * s'inscrit à son heure et se coche quand la lecture la dépasse.
 *
 * Le récit ne garde que le titre et l'heure de chaque étape : son détail s'affiche sur la 3D quand la lecture
 * l'atteint (ou qu'on clique dessus). La lecture de la courbe est dans son « ? ».
 *
 * La fenêtre garde le focus (Tab boucle à l'intérieur, Échap ferme) et l'ouvre sur « Lecture » : Espace met en pause
 * au lieu de fermer. Une panne réglée à l'instant se rejoue jusqu'à la reprise de la production, même si celle-ci
 * n'a pas encore eu lieu à l'ouverture : la fin du rejeu s'allonge au fil des secondes.
 */
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCheck,
  ClipboardCheck,
  Pause,
  Play,
  RotateCcw,
  TrendingUp,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useUi, useReducedMotion } from '@/store/ui';
import { usePiegeFocus } from '@/ui/usePiegeFocus';
import { useProject } from '@/store/project';
import { getSeries } from '@/store/live';
import { machineModel } from '@/domain/catalog';
import type { Alarme } from '@/domain/types';
import { getHistory } from '@/sim/history';
import { classify } from '@/sim/rules';
import { chronologie, chronologieDirect, imageA, type Chronologie, type EtapeChronologie, type EvenementChronologie } from '@/analytics/timeline';
import { StatusPill } from '@/ui/status';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { InfoTip } from '@/ui/InfoTip';
import { fmtDuration, fmtTime, fmtValue } from '@/ui/format';
import { graduationsRondes, uniteAxe } from '@/widgets/charts/axes';
import { estExercice } from './exercice';
import './replay.css';
// Moteur 3D chargé à l'ouverture d'un rejeu seulement.
const ReplayScene = lazy(() => import('./ReplayScene').then((m) => ({ default: m.ReplayScene })));

type Phase = 'avant' | 'panne' | 'apres';

const ETAPES: Record<EtapeChronologie, { titre: string; icon: LucideIcon; ton: 'warn' | 'crit' | 'ok' | 'accent'; phase: Phase }> = {
  derive: { titre: 'La mesure commence à dériver', icon: TrendingUp, ton: 'warn', phase: 'avant' },
  attention: { titre: 'Seuil d’attention franchi : EVAN prévient', icon: AlertTriangle, ton: 'warn', phase: 'avant' },
  alarme: { titre: 'Alarme : la machine s’arrête', icon: AlertOctagon, ton: 'crit', phase: 'panne' },
  acquittement: { titre: 'Quelqu’un prend l’alarme en charge', icon: CheckCheck, ton: 'accent', phase: 'panne' },
  reparation: { titre: 'Réparation terminée', icon: Wrench, ton: 'accent', phase: 'apres' },
  redemarrage: { titre: 'La machine redémarre', icon: Play, ton: 'ok', phase: 'apres' },
  production: { titre: 'Production rétablie', icon: Activity, ton: 'ok', phase: 'apres' },
};

const PHASE_TITRE: Record<Phase, string> = { avant: 'Avant la panne', panne: 'La panne', apres: 'Après' };

const VITESSES = [1, 15, 60, 240];
/**
 * Panne de la session : après la réparation, la machine se règle 6 s puis produit. Le rejeu attend d'avoir ces
 * secondes-là (et deux de production) dans le tampon des mesures avant de s'arrêter.
 */
const REPRISE_DIRECT_MS = 8_000;

const jourHeure = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Première lettre en minuscule, sauf pour un sigle (« UV », « CTP »). */
function minuscule(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s;
}

/** Écart à l'alarme, en mots : « 6 min avant l'alarme », « au moment de l'alarme », « 2 min après ». */
function relatif(ms: number): string {
  if (Math.abs(ms) < 1000) return 'au moment de l’alarme';
  return ms < 0 ? `${fmtDuration(-ms)} avant l’alarme` : `${fmtDuration(ms)} après`;
}

function titreEtape(e: EvenementChronologie, a: Alarme) {
  return e.etape === 'alarme' ? `Alarme ${a.code} : la machine s’arrête` : ETAPES[e.etape].titre;
}

function detailEtape(e: EvenementChronologie, c: Chronologie): string {
  const p = c.point;
  const a = c.alarme;
  switch (e.etape) {
    case 'derive':
      return p ? `« ${p.libelle} » quitte sa valeur normale (${fmtValue(p.nominal, p.unite)}).` : 'La mesure quitte sa valeur normale.';
    case 'attention':
      return `${p ? `« ${p.libelle} » vaut` : 'La mesure vaut'} ${fmtValue(e.valeur, p?.unite)}${e.seuil !== undefined ? `, au-delà du seuil d’attention (${fmtValue(e.seuil, p?.unite)})` : ''}. Il est encore temps d’agir.`;
    case 'alarme':
      return `${a.message}${e.seuil !== undefined ? `. Seuil d’alarme (${fmtValue(e.seuil, p?.unite ?? a.unite)}) franchi` : ''}.`;
    case 'acquittement':
      return `${a.acquitteePar ?? 'Le superviseur'}, ${fmtDuration(e.t - a.horodatage)} après l’alarme.`;
    case 'reparation':
      return machineModel(c.machine).defs[a.organeId]?.panne?.action ?? 'Organe remis en état.';
    case 'redemarrage':
      return 'Un réglage de reprise (calage) avant de relancer la production.';
    case 'production':
      return 'La machine retrouve sa cadence normale.';
  }
}

/** La phrase qui ouvre chaque temps du récit, calculée sur les heures de la chronologie. */
function phrasePhase(phase: Phase, c: Chronologie): string {
  const a = c.alarme;
  const ev = (k: EtapeChronologie) => c.evenements.find((e) => e.etape === k);
  if (phase === 'avant') {
    const debut = ev('derive') ?? ev('attention');
    return debut ? `${fmtDuration(a.horodatage - debut.t)} de signes avant l’alarme.` : 'Aucun signe avant : la mesure a basculé d’un coup.';
  }
  if (phase === 'panne') {
    const ack = ev('acquittement');
    return ack ? `Prise en charge ${fmtDuration(ack.t - a.horodatage)} après l’alarme.` : 'L’alarme n’a pas été acquittée.';
  }
  return a.finLe ? `Machine arrêtée ${fmtDuration(a.finLe - a.horodatage)} au total.` : 'La panne n’est pas encore réparée.';
}

/** Le récit, phase par phase. Il ne se redessine que lorsque la lecture passe une étape, pas à chaque image. */
const Recit = memo(function Recit({ c, courant, onSeek }: { c: Chronologie; courant: number; onSeek(t: number): void }) {
  const phases = (['avant', 'panne', 'apres'] as const).map((phase) => ({
    phase,
    etapes: c.evenements.map((e, i) => ({ e, i })).filter(({ e }) => ETAPES[e.etape].phase === phase),
  }));
  return (
    <ol className="rp-recit">
      {phases.map(({ phase, etapes }) => {
        const atteinte = etapes.some(({ i }) => i <= courant);
        return (
          <li key={phase} className={`rp-phase ${atteinte ? 'atteinte' : ''}`}>
            <h4>{PHASE_TITRE[phase]}</h4>
            <p className="rp-phase-phrase">{phrasePhase(phase, c)}</p>
            {etapes.length > 0 && (
              <ol className="rp-etapes">
                {etapes.map(({ e, i }) => {
                  const E = ETAPES[e.etape];
                  const etat = i < courant ? 'fait' : i === courant ? 'courant' : 'avenir';
                  return (
                    <li key={i} className={`rp-etape ${etat} ton-${E.ton}`}>
                      <button type="button" onClick={() => onSeek(e.t)} aria-current={i === courant ? 'step' : undefined}>
                        <span className="rp-point" aria-hidden>
                          <E.icon />
                        </span>
                        <span className="rp-etape-texte">
                          <b>{titreEtape(e, c.alarme)}</b>
                          <time>{relatif(e.t - c.alarme.horodatage)}</time>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
});

/** Le rejeu d'une panne. Ouvert par ReplayGate.tsx, qui ne charge ce fichier (et ses graphiques) qu'au besoin. */
export function Replay({ alarme }: { alarme: Alarme }) {
  const machines = useProject((s) => s.machines);
  const machine = machines.find((m) => m.id === alarme.machineId);
  const reduced = useReducedMotion();
  // Rejeu d'une panne d'exercice de la session : le récit ne prend pas le cramoisi de la panne réelle.
  const exercice = estExercice(alarme);
  const close = () => useUi.getState().setReplay(null);
  const fenetre = useRef<HTMLDivElement>(null);
  // Le bon de travail ouvert par-dessus le rejeu a la main sur le clavier (Échap, Tab, espaces dans les champs).
  const saisieOuverte = useUi((s) => !!s.saisie);
  usePiegeFocus(fenetre, !saisieOuverte, close);

  // Panne réglée à l'instant : la reprise n'est pas encore dans le tampon des mesures. L'horloge avance chaque seconde
  // et la chronologie s'allonge jusqu'à la couvrir.
  const direct = !alarme.id.startsWith('h-');
  const [horloge, setHorloge] = useState(() => Date.now());
  const grandit = direct && alarme.finLe !== undefined && horloge < alarme.finLe + REPRISE_DIRECT_MS;
  useEffect(() => {
    if (!grandit) return;
    const t = window.setInterval(() => setHorloge(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [grandit]);

  const c = useMemo<Chronologie | null>(() => {
    if (!machine) return null;
    return direct ? chronologieDirect(machine, alarme, getSeries, horloge) : chronologie(getHistory(machines), machine, alarme);
  }, [alarme, machine, machines, direct, horloge]);

  // Lecture : on part un peu avant la dérive, à la vitesse choisie ; animations réduites = pas de lecture automatique.
  const [t, setT] = useState(() => c?.debut ?? 0);
  const [playing, setPlaying] = useState(!reduced);
  // Une panne de la session dure quelques secondes : on la rejoue en temps réel ; une panne de l'historique, en accéléré.
  const [vitesse, setVitesse] = useState(() => (c && c.fin - c.debut < 5 * 60_000 ? 1 : 60));
  const last = useRef<number | null>(null);

  // Espace hors d'un bouton ou d'un champ : lecture ou pause. Le focus et Échap sont tenus par usePiegeFocus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useUi.getState().saisie) return;
      if (e.key === ' ' && !(e.target as HTMLElement).closest('button, input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Visite guidée : la phase de dérive se lit à vitesse normale, la suite (intervention, redémarrage) en accéléré.
  useEffect(() => {
    const h = (e: Event) => {
      setVitesse((e as CustomEvent<number>).detail);
      setPlaying(true);
    };
    window.addEventListener('evan:replay-vitesse', h);
    return () => window.removeEventListener('evan:replay-vitesse', h);
  }, []);

  useEffect(() => {
    if (!playing || !c) return;
    let raf = 0;
    const step = (now: number) => {
      const dt = last.current === null ? 0 : now - last.current;
      last.current = now;
      setT((cur) => {
        const next = cur + dt * vitesse;
        if (next >= c.fin) {
          // Une fin qui s'allonge encore : la lecture attend la suite au lieu de s'arrêter.
          if (!grandit) setPlaying(false);
          return c.fin;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, vitesse, c, grandit]);

  const seek = useCallback((x: number) => {
    setT(x);
    setPlaying(false);
  }, []);

  if (!machine || !c) {
    return (
      <div className="modal-backdrop" onMouseDown={close}>
        <div ref={fenetre} className="modal" role="dialog" aria-modal="true" aria-labelledby="replay-title" onMouseDown={(e) => e.stopPropagation()}>
          <button className="btn sm icon ghost modal-close" onClick={close} aria-label="Fermer" title="Fermer (Échap)">
            <X />
          </button>
          <h2 id="replay-title">Panne non rejouable</h2>
          <p className="muted">Les mesures de cette panne ne sont plus dans la mémoire de la session.</p>
        </div>
      </div>
    );
  }

  const image = imageA(c, t);
  let courant = -1;
  for (let i = 0; i < c.evenements.length && c.evenements[i].t <= t; i++) courant = i;
  const evCourant = courant >= 0 ? c.evenements[courant] : undefined;
  const model = machineModel(machine);
  const panne = model.defs[alarme.organeId]?.panne;
  const fini = t >= c.fin && !grandit;
  const restart = () => {
    setT(c.debut);
    setPlaying(true);
  };

  return (
    <div className="modal-backdrop replay-backdrop" onMouseDown={close}>
      <div ref={fenetre} className={`replay rp ${exercice ? 'exercice' : ''}`} role="dialog" aria-modal="true" aria-labelledby="replay-title" onMouseDown={(e) => e.stopPropagation()}>
        <header className="replay-head">
          {/* Le code est une référence, pas un état : une puce neutre, en chiffres à chasse fixe. */}
          <span className="chip mono" title="Code de l’alarme">
            {alarme.code}
          </span>
          <div className="grow" style={{ minWidth: 0 }}>
            <h2 id="replay-title" className="truncate">
              Revoir la panne de {machine.numero} {machine.nom}
            </h2>
            <p className="muted rp-sous-titre">
              {[jourHeure.format(alarme.horodatage), minuscule(alarme.message), alarme.finLe ? `arrêt ${fmtDuration(alarme.finLe - alarme.horodatage)}` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <button
            className="btn sm rp-compte-rendu"
            aria-label="Consigner le compte rendu"
            onClick={() => {
              // La lecture s'arrête le temps de remplir le bon, ouvert par-dessus le rejeu.
              setPlaying(false);
              useUi.getState().setSaisie({
                machineId: machine.id,
                organeId: alarme.organeId,
                type: 'curative',
                date: alarme.horodatage,
                duree: alarme.finLe ? Math.round((alarme.finLe - alarme.horodatage) / 60_000) : 30,
                titre: `${alarme.code} · ${alarme.message}`,
                compteRendu: panne?.action,
              });
            }}
            title="Consigner le compte rendu de cette réparation dans le carnet"
          >
            <ClipboardCheck /> <span>Consigner le compte rendu</span>
          </button>
          <button className="btn sm icon ghost" onClick={close} aria-label="Fermer" title="Fermer (Échap)">
            <X />
          </button>
        </header>

        <div className="replay-body">
          <section className="replay-stage" aria-label="Machine rejouée en 3D">
            {/* Sans WebGL (vieil appareil, navigateur bridé), la 3D manque mais le récit et la courbe restent. */}
            <ErrorBoundary
              label="Panne rejouée en 3D"
              fallback={
                <p className="rp-sans-3d">
                  La machine en 3D ne peut pas s’afficher sur cet appareil. Le récit et la courbe racontent la même panne.
                </p>
              }
            >
              <Suspense fallback={null}>
                <ReplayScene machine={machine} organe={c.organe} etat={image.etat} facteur={image.facteur} />
              </Suspense>
            </ErrorBoundary>
            <div className="replay-clock glass">
              <span className="mono">{fmtTime(t)}</span>
              <StatusPill etat={image.etat} />
            </div>
            {evCourant ? (
              <div className={`replay-now glass ton-${ETAPES[evCourant.etape].ton}`} key={`${evCourant.etape}-${evCourant.t}`} aria-live="polite">
                <span className="rp-now-phase">{PHASE_TITRE[ETAPES[evCourant.etape].phase]}</span>
                <b>{titreEtape(evCourant, alarme)}</b>
                <span>{detailEtape(evCourant, c)}</span>
              </div>
            ) : (
              <div className="replay-now glass ton-ok">
                <span className="rp-now-phase">Avant la panne</span>
                <b>Rien d’anormal pour l’instant</b>
              </div>
            )}
          </section>

          <aside className="replay-side">
            <h3 className="rp-cote-titre">Le récit</h3>
            <Recit c={c} courant={courant} onSeek={seek} />

            <h3 className="rp-cote-titre">Mesures à cet instant</h3>
            <div className="replay-values">
              {c.points.map((p) => {
                const v = image.valeurs[p.id];
                const niveau = v === undefined ? 'ok' : classify(v, p.seuils);
                return (
                  <div key={p.id} className={`replay-value niv-${niveau} ${p.id === c.point?.id ? 'main' : ''}`}>
                    <span className="truncate">{p.libelle}</span>
                    <span className="rp-mesure">
                      <b className="num">{fmtValue(v, p.unite)}</b>
                      <small>{niveau === 'alarme' ? 'alarme' : niveau === 'attention' ? 'attention' : 'normal'}</small>
                    </span>
                  </div>
                );
              })}
            </div>
            {(alarme.cause || panne?.action) && (
              <div className="replay-cause">
                {alarme.cause && (
                  <p>
                    <b>Pourquoi c’est arrivé</b> {alarme.cause}
                  </p>
                )}
                {panne?.action && (
                  <p>
                    <b>Ce qui a été fait</b> {panne.action}
                  </p>
                )}
              </div>
            )}
          </aside>
        </div>

        <footer className="replay-foot">
          <ReplayChart c={c} t={t} onSeek={seek} />
          <div className="replay-controls">
            <button data-autofocus className="btn sm primary" onClick={() => (fini ? restart() : setPlaying(!playing))} aria-label={playing ? 'Pause' : fini ? 'Revoir depuis le début' : 'Lecture'}>
              {playing ? <Pause /> : fini ? <RotateCcw /> : <Play />}
              <span>{playing ? 'Pause' : fini ? 'Revoir' : 'Lecture'}</span>
            </button>
            <input
              type="range"
              min={c.debut}
              max={c.fin}
              step={c.pas}
              value={t}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Position dans la panne"
              aria-valuetext={`${fmtTime(t)}, ${relatif(t - alarme.horodatage)}`}
            />
            <span className="faint rp-quand">{relatif(t - alarme.horodatage)}</span>
            <span className="faint rp-vitesse-label" id="rp-vitesse">
              Vitesse
            </span>
            <div className="seg" role="group" aria-labelledby="rp-vitesse">
              {VITESSES.map((v) => (
                <button key={v} aria-pressed={vitesse === v} onClick={() => setVitesse(v)} aria-label={v === 1 ? 'Temps réel' : `${v} fois plus vite`}>
                  ×{v}
                </button>
              ))}
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * Courbe de la mesure en cause, seuils et étapes. Le graphique ne se redessine pas pendant la lecture : seul le
 * curseur avance, par une translation, ce qui garde la lecture fluide.
 */
function ReplayChart({ c, t, onSeek }: { c: Chronologie; t: number; onSeek(t: number): void }) {
  const p = c.point;
  const position = Math.max(0, Math.min(1, (t - c.debut) / (c.fin - c.debut || 1)));
  if (!p) return null;
  return (
    <div className="chart replay-chart">
      <div className="replay-chart-title rp-courbe-titre">
        <b>{p.libelle}</b> <span className="faint">({p.unite})</span>
        <InfoTip label={`Lire la courbe : ${p.libelle}`}>
          <p>Bande grise : la plage normale. Traits rouges : les seuils d’alarme. Pointillés : les étapes du récit.</p>
          <p>Le curseur à rond suit la lecture ; un clic sur la courbe s’y place.</p>
        </InfoTip>
      </div>
      <div className="rp-courbe">
        <CourbeFixe c={c} onSeek={onSeek} />
        <div className="rp-curseur" aria-hidden>
          <i style={{ transform: `translateX(${position * 100}%)` }} />
        </div>
      </div>
    </div>
  );
}

const CourbeFixe = memo(function CourbeFixe({ c, onSeek }: { c: Chronologie; onSeek(t: number): void }) {
  const p = c.point!;
  const data = useMemo(() => c.images.map((i) => ({ t: i.t, v: i.valeurs[p.id] })), [c, p]);
  const [lo, hi, pad] = useMemo(() => {
    const s = p.seuils;
    const vals = data.map((d) => d.v).filter((v) => v !== undefined);
    let bas = Math.min(...vals);
    let haut = Math.max(...vals);
    for (const x of [s.alarmeBas, s.alarmeHaut, s.attentionBas, s.attentionHaut]) if (x !== undefined && x > bas - (haut - bas) && x < haut + (haut - bas)) (bas = Math.min(bas, x)), (haut = Math.max(haut, x));
    return [bas, haut, Math.max(1e-6, haut - bas) * 0.1];
  }, [data, p]);
  if (!data.length) return null;
  const s = p.seuils;
  return (
    <ResponsiveContainer width="100%" height={146}>
      <ComposedChart
        data={data}
        margin={{ top: 22, right: 12, bottom: 0, left: 0 }}
        onClick={(st) => {
          const x = Number((st as { activeLabel?: number | string }).activeLabel);
          if (Number.isFinite(x)) onSeek(x);
        }}
      >
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={[c.debut, c.fin]}
          tickFormatter={(x: number) => (c.fin - c.debut < 10 * 60_000 ? fmtTime(x) : fmtTime(x).slice(0, 5))}
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--grid)' }}
          minTickGap={40}
          height={24}
        />
        <YAxis
          domain={[lo - pad, hi + pad]}
          ticks={graduationsRondes(lo - pad, hi + pad, 3)}
          tick={{ fontSize: 11, fill: 'var(--text-3)' }}
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => v.toLocaleString('fr-FR')}
          label={p.unite ? uniteAxe(p.unite) : undefined}
        />
        {(s.attentionBas !== undefined || s.attentionHaut !== undefined) && (
          <ReferenceArea y1={s.attentionBas ?? lo - pad} y2={s.attentionHaut ?? hi + pad} fill="var(--idle-soft)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
        )}
        {[s.alarmeBas, s.alarmeHaut].map((x, i) => (x !== undefined ? <ReferenceLine key={i} y={x} stroke="var(--crit)" strokeWidth={1} ifOverflow="hidden" /> : null))}
        {c.evenements.map((e, i) => (
          <ReferenceLine key={`e${i}`} x={e.t} stroke={e.etape === 'alarme' ? 'var(--crit)' : 'var(--text-3)'} strokeDasharray={e.etape === 'alarme' ? undefined : '3 3'} strokeOpacity={0.7} />
        ))}
        <Tooltip
          cursor={{ stroke: 'var(--text-3)', strokeWidth: 1 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <div className="chart-tip" style={{ position: 'static' }}>
                <div className="faint">{fmtTime(Number(payload[0].payload.t))}</div>
                <b>{fmtValue(Number(payload[0].value), p.unite)}</b>
              </div>
            ) : null
          }
        />
        <Line type="monotone" dataKey="v" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
});
