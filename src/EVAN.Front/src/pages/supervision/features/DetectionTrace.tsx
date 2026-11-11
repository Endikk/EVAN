/**
 * Comment EVAN a repéré la panne, en quatre temps qui s'allument l'un après l'autre : le capteur mesure, la valeur
 * passe sa limite, EVAN déclenche l'alarme, l'écran prévient. Chaque temps dit ce qui s'est passé et le fait mesuré ;
 * la méthode est dans le « ? » du titre. Les maillons arrivent par paquets du flux temps réel ; on les allume un par
 * un pour que l'œil suive l'ordre. Le détail technique, horodaté maillon par maillon (automate, passerelle,
 * messages), reste replié en dessous.
 *
 * Une fois l'alarme levée, le bloc passe sous la fiche (ce qu'il faut faire d'abord) et s'ouvre replié (`replie`) :
 * une ligne dit la machine et le délai, un clic déplie les quatre temps.
 */
import { useEffect, useId, useState } from 'react';
import { Activity, Bell, ChevronDown, Cpu, Database, Gauge, MonitorSmartphone, Radio, Router, ShieldAlert, Workflow, X, Zap } from 'lucide-react';
import { useLive, type DetectionTrace as Trace, type EtapeTrace } from '@/store/live';
import { useProject } from '@/store/project';
import { useReducedMotion } from '@/store/ui';
import { machineModel } from '@/domain/catalog';
import { Details, TitreCarte } from '@/ui/explain';
import { alarmeDeLaTrace, etapesDetection, type CleEtape } from '../lib/detection';

const ICONE_MAILLON: Record<EtapeTrace, typeof Activity> = {
  defaut: Zap,
  capteur: Activity,
  automate: Cpu,
  passerelle: Router,
  mqtt: Radio,
  ingestion: Database,
  regles: Workflow,
  alarme: ShieldAlert,
  signalr: Bell,
  ecran: MonitorSmartphone,
};

const ICONE_ETAPE: Record<CleEtape, typeof Activity> = { mesure: Activity, limite: Gauge, alarme: ShieldAlert, ecran: MonitorSmartphone };

/** Intervalle entre deux temps qui s'allument : assez pour lire le titre, assez court pour ne pas faire attendre. */
const PAS_MS = 550;

const secondes = (ms: number, digits = 1) => `${(ms / 1000).toFixed(digits).replace('.', ',')} s`;

export function DetectionTrace({ trace, replie = false }: { trace: Trace; replie?: boolean }) {
  const machine = useProject((s) => s.machines.find((m) => m.id === trace.machineId));
  const perso = useProject((s) => (machine ? s.perso[machine.id] : undefined));
  const alarms = useLive((s) => s.alarms);
  const reduit = useReducedMotion();
  const [deplie, setDeplie] = useState(!replie);
  const corpsId = useId();

  const model = machine ? machineModel(machine, perso) : undefined;
  const alarme = alarmeDeLaTrace(trace, alarms);
  const point = alarme?.pointId ? model?.points.find((p) => p.id === alarme.pointId) : undefined;
  const numero = machine?.numero ?? 'La machine';
  const etapes = etapesDetection(trace, alarme, { numero, mesure: point?.libelle, discret: point?.type === 'alarme' });
  const faits = etapes.filter((e) => e.fait).length;

  // Les temps déjà passés s'allument un par un, au rythme de PAS_MS, jusqu'à rattraper le flux.
  const [allumes, setAllumes] = useState(() => (reduit ? faits : 0));
  useEffect(() => {
    if (allumes === faits) return;
    if (reduit || allumes > faits) return setAllumes(faits);
    const t = window.setTimeout(() => setAllumes((n) => Math.min(faits, n + 1)), allumes === 0 ? 150 : PAS_MS);
    return () => window.clearTimeout(t);
  }, [allumes, faits, reduit]);

  const t0 = trace.steps[0]?.t ?? trace.debut;
  const fini = trace.termine && allumes === etapes.length;
  const delai = etapes.find((e) => e.cle === 'ecran')?.valeur;
  const lecon = `${trace.simule ? 'Panne simulée' : 'Défaut'} sur ${numero}.${!deplie && trace.termine && delai ? ` Prévenu ${minusculeDebut(delai)}.` : ''}`;

  return (
    <section className={`card sv-detection ${fini ? 'fini' : ''} ${trace.simule ? 'simule' : ''}`} data-guide="sv-detection" aria-labelledby={`detection-${trace.id}`}>
      <TitreCarte
        id={`detection-${trace.id}`}
        titre={trace.termine ? 'Comment EVAN a repéré la panne' : 'EVAN suit une mesure qui se dérègle…'}
        aide="Le capteur mesure en continu. Dès qu’une valeur franchit sa limite, EVAN déclenche l’alarme : la machine passe en rouge sur le plan et la caméra montre l’organe en cause."
        lecon={lecon}
        actions={
          trace.termine && (
            <>
              <button
                className={`btn sm icon ghost sv-detection-deplier ${deplie ? 'ouvert' : ''}`}
                onClick={() => setDeplie((v) => !v)}
                aria-expanded={deplie}
                aria-controls={corpsId}
                aria-label={deplie ? 'Replier l’explication de la détection' : 'Déplier l’explication de la détection'}
                title={deplie ? 'Replier' : 'Déplier'}
              >
                <ChevronDown />
              </button>
              <button className="btn sm icon ghost" onClick={() => useLive.setState({ trace: undefined })} aria-label="Masquer l’explication de la détection" title="Masquer">
                <X />
              </button>
            </>
          )
        }
      />

      <div id={corpsId} hidden={!deplie}>
        <ol className="sv-etapes" aria-live="polite">
          {etapes.map((e, i) => {
            const Icone = ICONE_ETAPE[e.cle];
            const allume = i < allumes;
            const enCours = !allume && i === allumes && !trace.termine;
            return (
              <li key={e.cle} className={`sv-etape ${allume ? 'allume' : ''} ${enCours ? 'en-cours' : ''} ${e.cle}`} aria-current={enCours ? 'step' : undefined}>
                <span className="sv-etape-point" aria-hidden>
                  <Icone />
                </span>
                <span className="sv-etape-trait" aria-hidden />
                <div className="sv-etape-texte">
                  <b>{allume ? e.titre : e.titreAttente}</b>
                  {allume && e.valeur && <p>{e.valeur}</p>}
                </div>
              </li>
            );
          })}
        </ol>

        <Details titre="Détail technique" apercu={`${trace.steps.length} maillon${trace.steps.length > 1 ? 's' : ''}`}>
          <p className="sv-maillons-note">{trace.simule ? 'Délais d’une installation réelle typique, comptés depuis le défaut.' : 'Délais relevés sur l’installation, comptés depuis le défaut.'}</p>
          <ol className="sv-maillons">
            {trace.steps.map((s, i) => {
              const Icone = ICONE_MAILLON[s.etape];
              return (
                <li key={`${s.etape}-${i}`}>
                  <span className="sv-maillon-point" aria-hidden>
                    <Icone />
                  </span>
                  <div>
                    <b>{s.libelle}</b>
                    {s.detail && <p className="mono">{s.detail}</p>}
                  </div>
                  <time>+{secondes(s.t - t0, s.t - t0 < 10_000 ? 3 : 1)}</time>
                </li>
              );
            })}
          </ol>
        </Details>
      </div>
    </section>
  );
}

/** « En 0,3 s après la mesure » devient « en 0,3 s après la mesure » au milieu d'une phrase. */
function minusculeDebut(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
